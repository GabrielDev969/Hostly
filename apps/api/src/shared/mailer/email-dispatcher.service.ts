import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE } from '@shared/queues/queue-names';
import { SEND_EMAIL_JOB, SendEmailJobData } from './email.job';

@Injectable()
export class EmailDispatcher {
  constructor(@InjectQueue(QUEUE.emails) private readonly queue: Queue<SendEmailJobData>) {}

  async enqueue(data: SendEmailJobData): Promise<void> {
    await this.queue.add(SEND_EMAIL_JOB, data);
  }
}
