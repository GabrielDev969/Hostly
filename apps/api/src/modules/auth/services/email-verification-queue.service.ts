import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE } from '@shared/queues/queue-names';

export const RESEND_EMAIL_VERIFICATION_JOB = 'resend-email-verification';

export interface ResendEmailVerificationJobData {
  email: string;
}

// The public resend looks the user up here, off the request, so its response time cannot tell
// whether the email has an account. The job holds an email, so it leaves Redis once done.
@Injectable()
export class EmailVerificationQueue {
  constructor(
    @InjectQueue(QUEUE.emailVerification)
    private readonly queue: Queue<ResendEmailVerificationJobData>,
  ) {}

  async enqueueResend(email: string): Promise<void> {
    await this.queue.add(
      RESEND_EMAIL_VERIFICATION_JOB,
      { email },
      { removeOnComplete: true, removeOnFail: { age: 24 * 3600 } },
    );
  }
}
