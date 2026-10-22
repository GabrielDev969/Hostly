import { Throttle } from '@nestjs/throttler';

const minutes = (n: number) => n * 60_000;

export const RATE_LIMITS = {
  login: { limit: 10, ttl: minutes(1) },
  register: { limit: 5, ttl: minutes(15) },
  refreshToken: { limit: 30, ttl: minutes(1) },
  twoFactorVerify: { limit: 10, ttl: minutes(1) },
  twoFactorMutate: { limit: 5, ttl: minutes(15) },
  invitationAccept: { limit: 10, ttl: minutes(1) },
  emailVerifyRequest: { limit: 5, ttl: minutes(15) },
  emailVerifyConfirm: { limit: 10, ttl: minutes(1) },
  forgotPassword: { limit: 5, ttl: minutes(15) },
  resetPassword: { limit: 5, ttl: minutes(15) },
} as const;

export type RateLimitKey = keyof typeof RATE_LIMITS;

export const RateLimit = (key: RateLimitKey): MethodDecorator =>
  Throttle({ default: RATE_LIMITS[key] });
