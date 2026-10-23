import { HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import {
  PAIRING_LIMITS,
  PairingRateLimiter,
  PairingRedis,
  REFUND_IN_WINDOW,
} from './pairing-rate-limiter.service';

// In-memory stand-in with the same semantics as the Lua scripts and SET NX PX; each call is atomic.
class FakeRedis implements PairingRedis {
  readonly store = new Map<string, { value: string; ttlMs: number }>();
  failing = false;

  eval(script: string, _numKeys: number, key: string, windowMs: number): Promise<unknown> {
    if (this.failing) return Promise.reject(new Error('down'));
    if (script === REFUND_IN_WINDOW) {
      const entry = this.store.get(key);
      if (!entry) return Promise.resolve(0);
      entry.value = String(Number(entry.value) - 1);
      return Promise.resolve(Number(entry.value));
    }
    const count = Number(this.store.get(key)?.value ?? 0) + 1;
    const ttlMs = count === 1 ? windowMs : this.store.get(key)!.ttlMs;
    this.store.set(key, { value: String(count), ttlMs });
    return Promise.resolve(count);
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
      expect(await status(limiter.reserveCodeAttempt('u1'))).toBe('ok');
    }
    expect(await status(limiter.reserveCodeAttempt('u1'))).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(await status(limiter.reserveCodeAttempt('u2'))).toBe('ok');
    expect(redis.store.get('rate:pairing:code:user:u1')?.ttlMs).toBe(15 * 60_000);
  });

  it('lets only 5 of many simultaneous attempts through', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => status(limiter.reserveCodeAttempt('u1'))),
    );

    expect(results.filter((r) => r === 'ok')).toHaveLength(PAIRING_LIMITS.wrongCodesPerUser.limit);
  });

  it('gives a right code its attempt back, and never creates a counter by refunding', async () => {
    for (let i = 0; i < 10; i++) {
      await limiter.reserveCodeAttempt('u1');
      await limiter.refundCodeAttempt('u1');
    }
    expect(await status(limiter.reserveCodeAttempt('u1'))).toBe('ok');

    await limiter.refundCodeAttempt('u9');
    expect(redis.store.has('rate:pairing:code:user:u9')).toBe(false);
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
      limiter.reserveCodeAttempt('u1'),
      limiter.refundCodeAttempt('u1'),
      limiter.hitPoll('hash-a'),
    ]) {
      await expect(call).rejects.toBeInstanceOf(ServiceUnavailableException);
    }
  });
});
