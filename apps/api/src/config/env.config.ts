import './load-root-env';
import * as crypto from 'crypto';
import { z } from 'zod';
import { ROBOT_SOCKET_DEFAULTS } from '@hostly/contracts';

function decodeBase64Pem(raw: string, kind: 'PRIVATE' | 'PUBLIC'): string | null {
  try {
    const pem = Buffer.from(raw, 'base64').toString('utf8');
    const beginMarker = new RegExp(`-----BEGIN [A-Z ]*${kind} KEY-----`, 'm');
    const endMarker = new RegExp(`-----END [A-Z ]*${kind} KEY-----`, 'm');
    if (!beginMarker.test(pem) || !endMarker.test(pem)) return null;
    return pem;
  } catch {
    return null;
  }
}

const base64Pem = (label: string, kind: 'PRIVATE' | 'PUBLIC') =>
  z
    .string()
    .min(1, `${label} is required`)
    .transform((val, ctx) => {
      const pem = decodeBase64Pem(val, kind);
      if (!pem) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} must be a base64-encoded PEM ${kind.toLowerCase()} key`,
        });
        return z.NEVER;
      }
      return pem;
    });

const kidPattern = /^[A-Za-z0-9._-]{1,64}$/;

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    API_PORT: z.coerce.number().default(3001),
    APP_URL: z.string().url(),
    CORS_ORIGINS: z
      .string()
      .optional()
      .transform((val) =>
        val
          ? val
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
      ),

    DATABASE_URL: z.string().url(),
    DB_POOL_MAX: z.coerce.number().int().positive().default(10),
    DB_POOL_IDLE_MS: z.coerce.number().int().nonnegative().default(600_000),
    DB_POOL_CONN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

    REDIS_HOST: z.string(),
    REDIS_PORT: z.coerce.number().default(6379),
    REDIS_PASSWORD: z.string().optional(),

    TRUST_PROXY: z
      .string()
      .optional()
      .transform((val): boolean | number => {
        if (!val || val === 'false') return false;
        if (val === 'true') return true;
        const n = Number(val);
        return Number.isInteger(n) && n >= 0 ? n : true;
      }),

    JWT_ACCESS_CURRENT_KID: z
      .string()
      .min(1, 'JWT_ACCESS_CURRENT_KID is required')
      .regex(kidPattern, 'JWT_ACCESS_CURRENT_KID must match ^[A-Za-z0-9._-]{1,64}$'),
    JWT_ACCESS_PRIVATE_KEY_CURRENT: base64Pem('JWT_ACCESS_PRIVATE_KEY_CURRENT', 'PRIVATE'),
    JWT_ACCESS_PUBLIC_KEYS: z
      .string()
      .min(1, 'JWT_ACCESS_PUBLIC_KEYS is required')
      .transform((val, ctx) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(val);
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'JWT_ACCESS_PUBLIC_KEYS must be valid JSON',
          });
          return z.NEVER;
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'JWT_ACCESS_PUBLIC_KEYS must be a JSON object mapping kid to base64-encoded PEM public key',
          });
          return z.NEVER;
        }
        const entries = Object.entries(parsed as Record<string, unknown>);
        if (entries.length < 1 || entries.length > 10) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'JWT_ACCESS_PUBLIC_KEYS must contain 1-10 entries',
          });
          return z.NEVER;
        }
        const out: Record<string, string> = {};
        for (const [kid, raw] of entries) {
          if (!kidPattern.test(kid)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `JWT_ACCESS_PUBLIC_KEYS kid "${kid}" must match ^[A-Za-z0-9._-]{1,64}$`,
            });
            return z.NEVER;
          }
          if (typeof raw !== 'string') {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `JWT_ACCESS_PUBLIC_KEYS["${kid}"] must be a base64-encoded PEM public key`,
            });
            return z.NEVER;
          }
          const pem = decodeBase64Pem(raw, 'PUBLIC');
          if (!pem) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `JWT_ACCESS_PUBLIC_KEYS["${kid}"] must be a base64-encoded PEM public key`,
            });
            return z.NEVER;
          }
          out[kid] = pem;
        }
        return out;
      }),
    JWT_ACCESS_EXPIRES_IN: z
      .string()
      .default('15m')
      .transform((val) => val as `${number}${'s' | 'm' | 'h' | 'd'}`),
    JWT_ISSUER: z.string().min(1).optional(),
    JWT_AUDIENCE: z.string().min(1).optional(),

    ENCRYPTION_KEY: z
      .string()
      .length(64, 'ENCRYPTION_KEY must be 64 characters (32 bytes in hex)')
      .regex(/^[0-9a-fA-F]+$/, 'ENCRYPTION_KEY must be in hexadecimal format'),

    THROTTLE_TTL: z.coerce.number().default(60),
    THROTTLE_LIMIT: z.coerce.number().default(100),

    METRICS_ALLOWED_IPS: z
      .string()
      .optional()
      .transform((val) =>
        val
          ? val
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
      ),

    EMAIL_PROVIDER: z.enum(['resend', 'log']).default('log'),
    EMAIL_FROM: z.string().default('Workspace API <noreply@example.com>'),
    RESEND_API_KEY: z.string().optional(),
    APP_PUBLIC_URL: z.string().url().optional(),

    ALERT_DISCORD_WEBHOOK_URL: z.string().url().optional(),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
    LOG_PRETTY: z.coerce.boolean().optional(),
    LOG_SLOW_REQUEST_MS: z.coerce.number().int().positive().default(1000),
    LOG_SLOW_QUERY_MS: z.coerce.number().int().positive().default(100),

    PASSWORD_HISTORY_SIZE: z.coerce.number().int().min(0).max(50).default(5),

    SESSION_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
    AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
    EPHEMERAL_TOKEN_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
    TELEMETRY_RETENTION_DAYS: z.coerce.number().int().positive().default(7),

    ROBOT_SOCKET_PING_INTERVAL_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(ROBOT_SOCKET_DEFAULTS.pingIntervalMs),
    ROBOT_SOCKET_MISSED_PINGS: z.coerce
      .number()
      .int()
      .positive()
      .default(ROBOT_SOCKET_DEFAULTS.missedPings),
    ROBOT_SOCKET_HELLO_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(ROBOT_SOCKET_DEFAULTS.helloTimeoutMs),

    LIVE_TICKET_TTL_MS: z.coerce.number().int().positive().default(30_000),
    // Same as the access token: a panel connection never outlives the permissions it was opened with by much.
    LIVE_SOCKET_MAX_AGE_MS: z.coerce.number().int().positive().default(900_000),
  })
  .refine(
    (data) =>
      data.NODE_ENV === 'development' ||
      (data.CORS_ORIGINS !== undefined && data.CORS_ORIGINS.length > 0),
    {
      message: 'CORS_ORIGINS must be set (non-empty) when NODE_ENV is not development',
    },
  )
  .refine(
    (data) =>
      data.NODE_ENV !== 'production' ||
      (data.METRICS_ALLOWED_IPS !== undefined && data.METRICS_ALLOWED_IPS.length > 0),
    {
      message: 'METRICS_ALLOWED_IPS must be set (non-empty) when NODE_ENV=production',
    },
  )
  .refine((data) => data.EMAIL_PROVIDER !== 'resend' || !!data.RESEND_API_KEY, {
    message: 'RESEND_API_KEY must be set when EMAIL_PROVIDER=resend',
  })
  .refine((data) => data.JWT_ACCESS_PUBLIC_KEYS[data.JWT_ACCESS_CURRENT_KID] !== undefined, {
    message: 'JWT_ACCESS_CURRENT_KID must be a key in JWT_ACCESS_PUBLIC_KEYS',
  })
  .refine(
    (data) => {
      const declaredPem = data.JWT_ACCESS_PUBLIC_KEYS[data.JWT_ACCESS_CURRENT_KID];
      if (!declaredPem) return true;
      try {
        const derived = crypto
          .createPublicKey(data.JWT_ACCESS_PRIVATE_KEY_CURRENT)
          .export({ type: 'spki', format: 'pem' })
          .toString();
        const declared = crypto
          .createPublicKey(declaredPem)
          .export({ type: 'spki', format: 'pem' })
          .toString();
        return derived === declared;
      } catch {
        return false;
      }
    },
    {
      message:
        'JWT_ACCESS_PRIVATE_KEY_CURRENT does not match JWT_ACCESS_PUBLIC_KEYS[JWT_ACCESS_CURRENT_KID]',
    },
  );

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env: Env = parsed.data;
