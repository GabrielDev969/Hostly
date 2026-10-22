import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { HealthIndicatorService, HealthIndicatorResult } from '@nestjs/terminus';
import { Queue } from 'bullmq';
import { QUEUE } from '@shared/queues/queue-names';

@Injectable()
export class QueueHealthIndicator {
  constructor(
    @InjectQueue(QUEUE.emails) private readonly emails: Queue,
    private readonly healthIndicator: HealthIndicatorService,
  ) {}

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicator.check(key);
    try {
      const client = await this.emails.client;
      const reply = (await client.ping()) as string;
      if (reply !== 'PONG') {
        return indicator.down({ message: `Queue redis reply: ${reply}` });
      }
      return indicator.up({ queue: this.emails.name });
    } catch (err) {
      return indicator.down({
        message: err instanceof Error ? err.message : 'BullMQ queue unreachable',
      });
    }
  }
}
