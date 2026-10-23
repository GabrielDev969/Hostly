import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';

export const PAIRING_REDIS = 'PAIRING_REDIS';
export const PAIRING_LIMIT_PREFIX = 'rate:pairing:';

const minutes = (n: number) => n * 60_000;

export const PAIRING_LIMITS = {
  startsPerIp: { limit: 10, windowMs: minutes(10) },
  wrongCodesPerUser: { limit: 5, windowMs: minutes(15) },
  pollIntervalMs: 1_000,
} as const;

// A reserved code attempt, refunded into the window that counted it.
export interface CodeAttempt {
  key: string;
}

export interface PairingRedis {
  eval(script: string, numKeys: number, key: string, windowMs: number): Promise<unknown>;
  set(key: string, value: string, mode: 'PX', ttlMs: number, flag: 'NX'): Promise<'OK' | null>;
  quit(): Promise<unknown>;
}

// INCR and the expiry of a fresh window in one step, so a counter never outlives its window.
const INCREMENT_IN_WINDOW = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return count`;

// Gives back a reserved attempt without ever going below zero.
export const REFUND_ATTEMPT = `
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count > 0 then return redis.call('DECR', KEYS[1]) end
return count`;

const tooMany = () =>
  new HttpException('Too many pairing attempts; try again later', HttpStatus.TOO_MANY_REQUESTS);

// Pairing limits live outside @nestjs/throttler, which is off in tests: these must hold everywhere.
// Without Redis nothing is allowed through (fail closed).
@Injectable()
export class PairingRateLimiter implements OnModuleDestroy {
  constructor(@Inject(PAIRING_REDIS) private readonly redis: PairingRedis) {}

  async hitStart(ip: string): Promise<void> {
    const { limit, windowMs } = PAIRING_LIMITS.startsPerIp;
    const count = await this.call(() =>
      this.redis.eval(INCREMENT_IN_WINDOW, 1, `${PAIRING_LIMIT_PREFIX}start:ip:${ip}`, windowMs),
    );
    if (Number(count) > limit) throw tooMany();
  }

  // Every attempt takes a slot first, in one atomic step, so concurrent guesses cannot all slip
  // past the check; a right code gives its slot back, so only wrong codes count. The key names
  // its window, so a late refund lands in the window that counted it, never in a newer one.
  async reserveCodeAttempt(userId: string): Promise<CodeAttempt> {
    const { limit, windowMs } = PAIRING_LIMITS.wrongCodesPerUser;
    const key = `${PAIRING_LIMIT_PREFIX}code:user:${userId}:${Math.floor(Date.now() / windowMs)}`;
    const count = await this.call(() => this.redis.eval(INCREMENT_IN_WINDOW, 1, key, windowMs));
    if (Number(count) > limit) throw tooMany();
    return { key };
  }

  async refundCodeAttempt(attempt: CodeAttempt): Promise<void> {
    await this.call(() => this.redis.eval(REFUND_ATTEMPT, 1, attempt.key, 0));
  }

  async hitPoll(pollKeyHash: string): Promise<void> {
    const acquired = await this.call(() =>
      this.redis.set(
        `${PAIRING_LIMIT_PREFIX}poll:${pollKeyHash}`,
        '1',
        'PX',
        PAIRING_LIMITS.pollIntervalMs,
        'NX',
      ),
    );
    if (acquired !== 'OK') throw tooMany();
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }

  private async call<T>(command: () => Promise<T>): Promise<T> {
    try {
      return await command();
    } catch {
      throw new ServiceUnavailableException('Pairing is temporarily unavailable');
    }
  }
}
