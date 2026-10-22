import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE } from '@shared/queues/queue-names';
import { MailerService } from './mailer.service';
import { SEND_EMAIL_JOB, SendEmailJobData } from './email.job';

@Processor(QUEUE.emails)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger('Worker:Email');

  constructor(private readonly mailer: MailerService) {
    super();
  }

  async process(job: Job<SendEmailJobData>): Promise<void> {
    if (job.name !== SEND_EMAIL_JOB) {
      this.logger.warn({ msg: 'Unknown email job', name: job.name });
      return;
    }
    await this.mailer.send({
      to: job.data.to,
      subject: job.data.subject,
      html: job.data.html,
      text: job.data.text,
    });
  }
}
