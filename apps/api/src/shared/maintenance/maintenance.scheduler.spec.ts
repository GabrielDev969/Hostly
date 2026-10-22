import type { Queue } from 'bullmq';
import { MaintenanceScheduler } from './maintenance.scheduler';
import {
  ANONYMIZE_EXPIRED_USERS_JOB,
  CLEANUP_EXPIRED_SESSIONS_JOB,
  CLEANUP_EXPIRED_TOKENS_JOB,
  CLEANUP_OLD_AUDIT_LOGS_JOB,
} from './maintenance.jobs';

describe('MaintenanceScheduler', () => {
  it('schedules all four daily repeatable jobs on bootstrap with stable jobIds', async () => {
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const scheduler = new MaintenanceScheduler(queue as unknown as Queue);

    await scheduler.onModuleInit();

    const expected = [
      ANONYMIZE_EXPIRED_USERS_JOB,
      CLEANUP_EXPIRED_SESSIONS_JOB,
      CLEANUP_EXPIRED_TOKENS_JOB,
      CLEANUP_OLD_AUDIT_LOGS_JOB,
    ];

    expect(queue.add).toHaveBeenCalledTimes(expected.length);
    for (const name of expected) {
      expect(queue.add).toHaveBeenCalledWith(
        name,
        {},
        expect.objectContaining({
          repeat: { pattern: '0 3 * * *' },
          jobId: `repeat:${name}`,
        }),
      );
    }
  });
});
