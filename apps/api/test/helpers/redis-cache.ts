import { randomUUID } from 'crypto';
import KeyvRedis from '@keyv/redis';
import { Keyv } from 'keyv';
import { createCache, type Cache } from 'cache-manager';

// The store production uses (Keyv over Redis), on the Redis the e2e globalSetup started. Each cache gets its own
// Keyv namespace, so test files running in parallel never read each other's keys.
export function createRedisCache(): Cache {
  const url = `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`;
  return createCache({
    stores: [new Keyv({ store: new KeyvRedis(url), namespace: `test-${randomUUID()}` })],
  });
}
