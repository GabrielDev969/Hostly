import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE } from '@shared/queues/queue-names';
import { RequestEmailVerificationUseCase } from '../use-cases/request-email-verification.use-case';
import {
  RESEND_EMAIL_VERIFICATION_JOB,
  ResendEmailVerificationJobData,
} from '../services/email-verification-queue.service';

@Processor(QUEUE.emailVerification)
export class EmailVerificationProcessor extends WorkerHost {
  private readonly logger = new Logger('Worker:EmailVerification');

  constructor(private readonly requestEmailVerification: RequestEmailVerificationUseCase) {
    super();
  }

  async process(job: Job<ResendEmailVerificationJobData>): Promise<void> {
    if (job.name !== RESEND_EMAIL_VERIFICATION_JOB) {
      this.logger.warn({ msg: 'Unknown email verification job', name: job.name });
      return;
    }
    await this.requestEmailVerification.executeForEmail(job.data.email);
  }
}
