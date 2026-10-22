import { Injectable, Logger } from '@nestjs/common';
import { EmailVerifyTokensRepository } from '../repositories/email-verify-tokens.repository.interface';
import { PasswordResetTokensRepository } from '../repositories/password-reset-tokens.repository.interface';
import { env } from 'src/config/env.config';

@Injectable()
export class CleanupExpiredTokensUseCase {
  private readonly logger = new Logger('CleanupExpiredTokens');

  constructor(
    private readonly emailVerify: EmailVerifyTokensRepository,
    private readonly passwordReset: PasswordResetTokensRepository,
  ) {}

  async execute(): Promise<{ emailVerify: number; passwordReset: number }> {
    const cutoff = new Date(Date.now() - env.EPHEMERAL_TOKEN_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const [emailVerify, passwordReset] = await Promise.all([
      this.emailVerify.deleteExpired(cutoff),
      this.passwordReset.deleteExpired(cutoff),
    ]);

    if (emailVerify + passwordReset > 0) {
      this.logger.log({
        msg: 'Deleted expired ephemeral tokens',
        emailVerify,
        passwordReset,
        retentionDays: env.EPHEMERAL_TOKEN_RETENTION_DAYS,
      });
    }
    return { emailVerify, passwordReset };
  }
}
