import type { Queue } from 'bullmq';
import {
  EmailVerificationQueue,
  RESEND_EMAIL_VERIFICATION_JOB,
  ResendEmailVerificationJobData,
} from './email-verification-queue.service';

describe('EmailVerificationQueue', () => {
  it('queues only the email and drops the job from Redis once it completes', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const queue = new EmailVerificationQueue({
      add,
    } as unknown as Queue<ResendEmailVerificationJobData>);

    await queue.enqueueResend('a@b.c');

    expect(add).toHaveBeenCalledWith(
      RESEND_EMAIL_VERIFICATION_JOB,
      { email: 'a@b.c' },
      { removeOnComplete: true, removeOnFail: { age: 24 * 3600 } },
    );
  });
});
