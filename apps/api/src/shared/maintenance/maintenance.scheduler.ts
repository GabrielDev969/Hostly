import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE } from '@shared/queues/queue-names';
import {
  ANONYMIZE_EXPIRED_USERS_JOB,
  CLEANUP_EXPIRED_SESSIONS_JOB,
  CLEANUP_EXPIRED_TOKENS_JOB,
  CLEANUP_OLD_AUDIT_LOGS_JOB,
} from './maintenance.jobs';

const DAILY_AT_3AM = '0 3 * * *';

const SCHEDULED_JOBS = [
  ANONYMIZE_EXPIRED_USERS_JOB,
  CLEANUP_EXPIRED_SESSIONS_JOB,
  CLEANUP_EXPIRED_TOKENS_JOB,
  CLEANUP_OLD_AUDIT_LOGS_JOB,
] as const;

@Injectable()
export class MaintenanceScheduler implements OnModuleInit {
  private readonly logger = new Logger('MaintenanceScheduler');

  constructor(@InjectQueue(QUEUE.maintenance) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    for (const name of SCHEDULED_JOBS) {
      await this.queue.add(
        name,
        {},
        {
          repeat: { pattern: DAILY_AT_3AM },
          jobId: `repeat:${name}`,
        },
      );
    }
    this.logger.log({
      msg: 'Scheduled repeatable jobs',
      jobs: SCHEDULED_JOBS,
      cron: DAILY_AT_3AM,
    });
  }
}
