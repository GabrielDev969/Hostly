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

export interface PairingRedis {
  eval(script: string, numKeys: number, key: string, windowMs: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'PX', ttlMs: number, flag: 'NX'): Promise<'OK' | null>;
  quit(): Promise<unknown>;
}

// INCR and the expiry of a fresh window in one step, so a counter never outlives its window.
const INCREMENT_IN_WINDOW = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
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

  async assertCodeAttemptsLeft(userId: string): Promise<void> {
    const count = await this.call(() => this.redis.get(this.wrongCodeKey(userId)));
    if (Number(count ?? 0) >= PAIRING_LIMITS.wrongCodesPerUser.limit) throw tooMany();
  }

  async recordWrongCode(userId: string): Promise<void> {
    await this.call(() =>
      this.redis.eval(
        INCREMENT_IN_WINDOW,
        1,
        this.wrongCodeKey(userId),
        PAIRING_LIMITS.wrongCodesPerUser.windowMs,
      ),
    );
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

  private wrongCodeKey(userId: string): string {
    return `${PAIRING_LIMIT_PREFIX}code:user:${userId}`;
  }

  private async call<T>(command: () => Promise<T>): Promise<T> {
    try {
      return await command();
    } catch {
      throw new ServiceUnavailableException('Pairing is temporarily unavailable');
    }
  }
}
