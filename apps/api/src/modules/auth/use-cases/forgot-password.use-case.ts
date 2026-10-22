import { randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { PasswordResetTokensRepository } from '../repositories/password-reset-tokens.repository.interface';
import { CryptoUtil } from '@shared/utils/crypto.util';
import { EmailDispatcher } from '@shared/mailer/email-dispatcher.service';
import { buildPasswordResetUrl, passwordResetEmail } from '@shared/mailer/templates';

const TOKEN_BYTES = 32;
const TTL_MS = 60 * 60 * 1000;

@Injectable()
export class ForgotPasswordUseCase {
  constructor(
    private users: UsersRepository,
    private tokens: PasswordResetTokensRepository,
    private emailDispatcher: EmailDispatcher,
  ) {}

  async execute(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    // OAuth-only users (no passwordHash yet) can still use this flow to set
    // a password for the first time — the reset endpoint just calls update.
    if (!user) return;

    await this.tokens.deletePendingForUser(user.id);

    const rawToken = randomBytes(TOKEN_BYTES).toString('hex');
    const tokenHash = CryptoUtil.hashToken(rawToken);
    await this.tokens.create({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + TTL_MS),
    });

    const message = passwordResetEmail({
      name: user.name,
      resetUrl: buildPasswordResetUrl(rawToken),
    });
    await this.emailDispatcher.enqueue({ to: user.email, ...message });
  }
}
