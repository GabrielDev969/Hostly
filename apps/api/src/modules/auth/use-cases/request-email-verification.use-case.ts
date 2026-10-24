import { randomBytes } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import type { User } from '@modules/users/entities/user.entity';
import { EmailVerifyTokensRepository } from '../repositories/email-verify-tokens.repository.interface';
import { CryptoUtil } from '@shared/utils/crypto.util';
import { EmailDispatcher } from '@shared/mailer/email-dispatcher.service';
import { buildVerifyEmailUrl, verifyEmail } from '@shared/mailer/templates';

const TOKEN_BYTES = 32;
const TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class RequestEmailVerificationUseCase {
  constructor(
    private users: UsersRepository,
    private tokens: EmailVerifyTokensRepository,
    private emailDispatcher: EmailDispatcher,
  ) {}

  async execute(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    await this.issue(user);
  }

  // The public resend: an unknown email ends here quietly, like forgot-password. findByEmail is
  // not cached, so emailVerifiedAt is read fresh from the database.
  async executeForEmail(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (user) await this.issue(user);
  }

  private async issue(user: User): Promise<void> {
    if (user.emailVerifiedAt) return;

    await this.tokens.deletePendingForUser(user.id);

    const rawToken = randomBytes(TOKEN_BYTES).toString('hex');
    const tokenHash = CryptoUtil.hashToken(rawToken);
    await this.tokens.create({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + TTL_MS),
    });

    const message = verifyEmail({
      name: user.name,
      verifyUrl: buildVerifyEmailUrl(rawToken),
    });
    await this.emailDispatcher.enqueue({ to: user.email, ...message });
  }
}
