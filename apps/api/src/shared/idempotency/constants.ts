export const IDEMPOTENT_KEY = 'idempotent';
export const IDEMPOTENCY_REDIS = 'IDEMPOTENCY_REDIS';

export const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_IDEMPOTENCY_LOCK_TTL_MS = 60 * 1000;

export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._-]{1,255}$/;
