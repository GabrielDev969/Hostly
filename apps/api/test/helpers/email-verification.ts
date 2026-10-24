import type { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import Redis from 'ioredis';
import { QUEUE } from '../../src/shared/queues/queue-names';
import { EMAIL_VERIFICATION_LIMIT_PREFIX } from '../../src/modules/auth/services/email-verification-rate-limiter.service';

// The resend limits count in the real Redis even in tests, so each test starts from a clean slate.
export async function resetEmailVerificationLimits(): Promise<void> {
  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD,
  });
  try {
    const keys = await redis.keys(`${EMAIL_VERIFICATION_LIMIT_PREFIX}*`);
    if (keys.length > 0) await redis.del(...keys);
  } finally {
    await redis.quit();
  }
}

// The resend answers before its job runs; this waits, with a deadline, until the queue is idle.
// A failed job waits for a 5 s retry and so outlives the deadline: the test fails, never passes early.
export async function waitForResendJobs(app: INestApplication, timeoutMs = 3_000): Promise<void> {
  const queue = app.get<Queue>(getQueueToken(QUEUE.emailVerification));
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if ((await queue.getFailedCount()) > 0) throw new Error('A resend job failed');
    const pending = await queue.getJobCountByTypes('waiting', 'active', 'delayed', 'prioritized');
    if (pending === 0) return;
    if (Date.now() > deadline) throw new Error(`${pending} resend jobs still pending`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
