import { Injectable, BadRequestException } from '@nestjs/common';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { EmailVerifyTokensRepository } from '../repositories/email-verify-tokens.repository.interface';
import { CryptoUtil } from '@shared/utils/crypto.util';

@Injectable()
export class VerifyEmailUseCase {
  constructor(
    private users: UsersRepository,
    private tokens: EmailVerifyTokensRepository,
  ) {}

  async execute(rawToken: string): Promise<void> {
    const tokenHash = CryptoUtil.hashToken(rawToken);
    const record = await this.tokens.findByTokenHash(tokenHash);
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.users.update(record.userId, { emailVerifiedAt: new Date() });
    await this.tokens.markUsed(record.id);
  }
}
