import { HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { PAIRING_LIMITS, PairingRateLimiter, PairingRedis } from './pairing-rate-limiter.service';

// In-memory stand-in with the same window semantics as the Lua script and SET NX PX.
class FakeRedis implements PairingRedis {
  readonly store = new Map<string, { value: string; ttlMs: number }>();
  failing = false;

  eval(_script: string, _numKeys: number, key: string, windowMs: number): Promise<unknown> {
    if (this.failing) return Promise.reject(new Error('down'));
    const count = Number(this.store.get(key)?.value ?? 0) + 1;
    const ttlMs = count === 1 ? windowMs : this.store.get(key)!.ttlMs;
    this.store.set(key, { value: String(count), ttlMs });
    return Promise.resolve(count);
  }

  get(key: string): Promise<string | null> {
    if (this.failing) return Promise.reject(new Error('down'));
    return Promise.resolve(this.store.get(key)?.value ?? null);
  }

  set(key: string, value: string, _mode: 'PX', ttlMs: number): Promise<'OK' | null> {
    if (this.failing) return Promise.reject(new Error('down'));
    if (this.store.has(key)) return Promise.resolve(null);
    this.store.set(key, { value, ttlMs });
    return Promise.resolve('OK');
  }

  quit(): Promise<unknown> {
    return Promise.resolve('OK');
  }
}

const status = async (promise: Promise<unknown>): Promise<number | 'ok'> => {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return (error as { getStatus(): number }).getStatus();
  }
};

describe('PairingRateLimiter', () => {
  let redis: FakeRedis;
  let limiter: PairingRateLimiter;

  beforeEach(() => {
    redis = new FakeRedis();
    limiter = new PairingRateLimiter(redis);
  });

  it('allows 10 starts per IP in 10 minutes and refuses the 11th with 429', async () => {
    for (let i = 0; i < PAIRING_LIMITS.startsPerIp.limit; i++) {
      expect(await status(limiter.hitStart('10.0.0.1'))).toBe('ok');
    }
    expect(await status(limiter.hitStart('10.0.0.1'))).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(await status(limiter.hitStart('10.0.0.2'))).toBe('ok');
    expect(redis.store.get('rate:pairing:start:ip:10.0.0.1')?.ttlMs).toBe(10 * 60_000);
  });

  it('blocks a user after 5 wrong codes in 15 minutes', async () => {
    for (let i = 0; i < PAIRING_LIMITS.wrongCodesPerUser.limit; i++) {
      expect(await status(limiter.assertCodeAttemptsLeft('u1'))).toBe('ok');
      await limiter.recordWrongCode('u1');
    }
    expect(await status(limiter.assertCodeAttemptsLeft('u1'))).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(await status(limiter.assertCodeAttemptsLeft('u2'))).toBe('ok');
    expect(redis.store.get('rate:pairing:code:user:u1')?.ttlMs).toBe(15 * 60_000);
  });

  it('allows one poll per second per pairing', async () => {
    expect(await status(limiter.hitPoll('hash-a'))).toBe('ok');
    expect(await status(limiter.hitPoll('hash-a'))).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(await status(limiter.hitPoll('hash-b'))).toBe('ok');
    expect(redis.store.get('rate:pairing:poll:hash-a')?.ttlMs).toBe(1_000);
  });

  it('fails closed with 503 when Redis is unavailable', async () => {
    redis.failing = true;

    for (const call of [
      limiter.hitStart('10.0.0.1'),
      limiter.assertCodeAttemptsLeft('u1'),
      limiter.recordWrongCode('u1'),
      limiter.hitPoll('hash-a'),
    ]) {
      await expect(call).rejects.toBeInstanceOf(ServiceUnavailableException);
    }
  });
});
