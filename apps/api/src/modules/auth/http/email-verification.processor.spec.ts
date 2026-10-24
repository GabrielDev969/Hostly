import type { Job } from 'bullmq';
import { EmailVerificationProcessor } from './email-verification.processor';
import { RequestEmailVerificationUseCase } from '../use-cases/request-email-verification.use-case';
import {
  RESEND_EMAIL_VERIFICATION_JOB,
  ResendEmailVerificationJobData,
} from '../services/email-verification-queue.service';

describe('EmailVerificationProcessor', () => {
  let requestEmailVerification: jest.Mocked<RequestEmailVerificationUseCase>;
  let processor: EmailVerificationProcessor;

  beforeEach(() => {
    requestEmailVerification = {
      executeForEmail: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RequestEmailVerificationUseCase>;
    processor = new EmailVerificationProcessor(requestEmailVerification);
  });

  const job = (name: string) =>
    ({ name, data: { email: 'a@b.c' } }) as unknown as Job<ResendEmailVerificationJobData>;

  it('resends the verification for the email in the job', async () => {
    await processor.process(job(RESEND_EMAIL_VERIFICATION_JOB));
    expect(requestEmailVerification.executeForEmail).toHaveBeenCalledWith('a@b.c');
  });

  it('ignores unknown job names', async () => {
    await processor.process(job('unknown'));
    expect(requestEmailVerification.executeForEmail).not.toHaveBeenCalled();
  });
});
