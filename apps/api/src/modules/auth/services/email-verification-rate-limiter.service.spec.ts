import { HttpStatus } from '@nestjs/common';
import { CryptoUtil } from '@shared/utils/crypto.util';
import {
  EMAIL_VERIFICATION_LIMITS,
  EmailVerificationRateLimiter,
  EmailVerificationRedis,
} from './email-verification-rate-limiter.service';

// In-memory stand-in with the semantics of the INCR + PEXPIRE script; each call is atomic.
class FakeRedis implements EmailVerificationRedis {
  readonly store = new Map<string, { count: number; ttlMs: number }>();
  failing = false;

  eval(_script: string, _numKeys: number, key: string, windowMs: number): Promise<unknown> {
    if (this.failing) return Promise.reject(new Error('down'));
    const current = this.store.get(key);
    const count = (current?.count ?? 0) + 1;
    this.store.set(key, { count, ttlMs: current?.ttlMs ?? windowMs });
    return Promise.resolve(count);
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

const message = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return (error as Error).message;
  }
};

describe('EmailVerificationRateLimiter', () => {
  let redis: FakeRedis;
  let limiter: EmailVerificationRateLimiter;

  beforeEach(() => {
    redis = new FakeRedis();
    limiter = new EmailVerificationRateLimiter(redis);
  });

  it('keys the email by its hash, never by the address', async () => {
    await limiter.hitResend('10.0.0.1', 'jane@example.com');

    const keys = [...redis.store.keys()];
    expect(keys).toEqual([
      'rate:email-verify:ip:10.0.0.1',
      `rate:email-verify:email:${CryptoUtil.hashToken('jane@example.com')}`,
    ]);
    expect(keys.join()).not.toContain('jane');
    expect(redis.store.get(keys[1]!)?.ttlMs).toBe(15 * 60_000);
  });

  it('allows 3 resends per email in 15 minutes and refuses the 4th with 429', async () => {
    for (let i = 0; i < EMAIL_VERIFICATION_LIMITS.resendsPerEmail.limit; i++) {
      expect(await status(limiter.hitResend(`10.0.0.${i}`, 'a@b.c'))).toBe('ok');
    }
    expect(await status(limiter.hitResend('10.0.0.9', 'a@b.c'))).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(await status(limiter.hitResend('10.0.0.9', 'other@b.c'))).toBe('ok');
  });

  it('allows 10 resends per IP in 15 minutes and refuses the 11th with 429', async () => {
    for (let i = 0; i < EMAIL_VERIFICATION_LIMITS.resendsPerIp.limit; i++) {
      expect(await status(limiter.hitResend('10.0.0.1', `user${i}@b.c`))).toBe('ok');
    }
    expect(await status(limiter.hitResend('10.0.0.1', 'new@b.c'))).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );
    expect(await status(limiter.hitResend('10.0.0.2', 'new@b.c'))).toBe('ok');
  });

  it('does not spend the email allowance of a request its IP already lost', async () => {
    for (let i = 0; i < EMAIL_VERIFICATION_LIMITS.resendsPerIp.limit; i++) {
      await limiter.hitResend('10.0.0.1', `user${i}@b.c`);
    }
    expect(await status(limiter.hitResend('10.0.0.1', 'victim@b.c'))).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );

    expect(redis.store.has(`rate:email-verify:email:${CryptoUtil.hashToken('victim@b.c')}`)).toBe(
      false,
    );
  });

  it('answers both limits with the same message', async () => {
    for (let i = 0; i < 3; i++) await status(limiter.hitResend(`10.0.1.${i}`, 'a@b.c'));
    const perEmail = await message(limiter.hitResend('10.0.1.9', 'a@b.c'));
    for (let i = 0; i < 10; i++) await status(limiter.hitResend('10.0.2.1', `user${i}@b.c`));
    const perIp = await message(limiter.hitResend('10.0.2.1', 'new@b.c'));

    expect(perEmail).toBe('Too many requests; try again later');
    expect(perIp).toBe(perEmail);
  });

  it('fails closed with 503 when Redis is unavailable', async () => {
    redis.failing = true;
    expect(await status(limiter.hitResend('10.0.0.1', 'a@b.c'))).toBe(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  });
});
