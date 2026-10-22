import { Injectable, BadRequestException } from '@nestjs/common';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { PasswordResetTokensRepository } from '../repositories/password-reset-tokens.repository.interface';
import { PasswordHistoriesRepository } from '../repositories/password-histories.repository.interface';
import { SessionsRepository } from '@modules/sessions/repositories/sessions.repository.interface';
import { CryptoUtil } from '@shared/utils/crypto.util';
import { env } from 'src/config/env.config';

interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    private users: UsersRepository,
    private tokens: PasswordResetTokensRepository,
    private history: PasswordHistoriesRepository,
    private sessions: SessionsRepository,
  ) {}

  async execute(input: ResetPasswordInput): Promise<void> {
    const tokenHash = CryptoUtil.hashToken(input.token);
    const record = await this.tokens.findByTokenHash(tokenHash);
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const historySize = env.PASSWORD_HISTORY_SIZE;
    const user = await this.users.findById(record.userId);
    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (historySize > 0) {
      const previousHashes: string[] = [];
      if (user.passwordHash) previousHashes.push(user.passwordHash);
      if (historySize > 1) {
        const stored = await this.history.findRecentHashes(user.id, historySize - 1);
        previousHashes.push(...stored);
      }
      for (const oldHash of previousHashes) {
        if (await CryptoUtil.verifyPassword(oldHash, input.newPassword)) {
          throw new BadRequestException(
            `Password cannot match any of the last ${historySize} passwords`,
          );
        }
      }
    }

    const passwordHash = await CryptoUtil.hashPassword(input.newPassword);
    await this.users.update(record.userId, { passwordHash });
    if (historySize > 0 && user.passwordHash) {
      await this.history.record(user.id, user.passwordHash, historySize - 1);
    }
    await this.users.invalidateTokens(record.userId);
    await this.tokens.markUsed(record.id);
    await this.sessions.revokeAllForUser(record.userId);
  }
}
