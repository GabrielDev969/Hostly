import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CryptoUtil } from '@shared/utils/crypto.util';

export const EMAIL_VERIFICATION_REDIS = 'EMAIL_VERIFICATION_REDIS';
export const EMAIL_VERIFICATION_LIMIT_PREFIX = 'rate:email-verify:';

const minutes = (n: number) => n * 60_000;

export const EMAIL_VERIFICATION_LIMITS = {
  resendsPerIp: { limit: 10, windowMs: minutes(15) },
  resendsPerEmail: { limit: 3, windowMs: minutes(15) },
} as const;

export interface EmailVerificationRedis {
  eval(script: string, numKeys: number, key: string, windowMs: number): Promise<unknown>;
  quit(): Promise<unknown>;
}

// Same script as the pairing limiter: INCR and the expiry of a fresh window in one step.
const INCREMENT_IN_WINDOW = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return count`;

// One message for both limits and for any email: a 429 must not tell whether the account exists.
const tooMany = () =>
  new HttpException('Too many requests; try again later', HttpStatus.TOO_MANY_REQUESTS);

// Lives outside @nestjs/throttler, which is off in tests: these limits must hold everywhere.
// Without Redis nothing is allowed through (fail closed).
@Injectable()
export class EmailVerificationRateLimiter implements OnModuleDestroy {
  constructor(@Inject(EMAIL_VERIFICATION_REDIS) private readonly redis: EmailVerificationRedis) {}

  // Counts before any lookup, so the answer is the same whether the email has an account or not.
  // The email key is its hash: the address itself never becomes a Redis key.
  async hitResend(ip: string, email: string): Promise<void> {
    await this.hit(`ip:${ip}`, EMAIL_VERIFICATION_LIMITS.resendsPerIp);
    await this.hit(
      `email:${CryptoUtil.hashToken(email)}`,
      EMAIL_VERIFICATION_LIMITS.resendsPerEmail,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }

  private async hit(key: string, { limit, windowMs }: { limit: number; windowMs: number }) {
    let count: unknown;
    try {
      count = await this.redis.eval(
        INCREMENT_IN_WINDOW,
        1,
        `${EMAIL_VERIFICATION_LIMIT_PREFIX}${key}`,
        windowMs,
      );
    } catch {
      throw new ServiceUnavailableException('Email verification is temporarily unavailable');
    }
    if (Number(count) > limit) throw tooMany();
  }
}
