import Redis from 'ioredis';
import { PAIRING_LIMIT_PREFIX } from '../../src/modules/robots/services/pairing-rate-limiter.service';

// Pairing limits count in the real Redis even in tests, so each test starts from a clean slate.
export async function resetPairingLimits(): Promise<void> {
  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD,
  });
  try {
    const keys = await redis.keys(`${PAIRING_LIMIT_PREFIX}*`);
    if (keys.length > 0) await redis.del(...keys);
  } finally {
    await redis.quit();
  }
}
