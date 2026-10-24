import { Injectable } from '@nestjs/common';
import { EmailVerificationRateLimiter } from '../services/email-verification-rate-limiter.service';
import { EmailVerificationQueue } from '../services/email-verification-queue.service';

export interface ResendEmailVerificationInput {
  email: string;
  ip: string;
}

// No user lookup on the request path: the same Redis work for any email, so neither the answer
// nor its timing tells whether the account exists or is already verified. The job does the rest.
@Injectable()
export class ResendEmailVerificationUseCase {
  constructor(
    private readonly limiter: EmailVerificationRateLimiter,
    private readonly queue: EmailVerificationQueue,
  ) {}

  async execute({ email, ip }: ResendEmailVerificationInput): Promise<void> {
    await this.limiter.hitResend(ip, email);
    await this.queue.enqueueResend(email);
  }
}
