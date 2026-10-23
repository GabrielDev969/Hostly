export const LIVE_BACKOFF = { baseMs: 1_000, maxMs: 30_000, jitter: 0.2 } as const;

// 1, 2, 4, 8, 16 and then 30 s, each within ±20% so the panels of a restart do not come back together.
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(LIVE_BACKOFF.maxMs, LIVE_BACKOFF.baseMs * 2 ** attempt);
  const spread = 1 - LIVE_BACKOFF.jitter + 2 * LIVE_BACKOFF.jitter * random();
  return Math.min(LIVE_BACKOFF.maxMs, Math.round(base * spread));
}
