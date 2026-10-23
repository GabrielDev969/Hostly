import type { IncomingMessage } from 'http';

// Device tokens and panel tickets are CryptoUtil.generateToken(32): anything else is refused before any I/O.
export const SECRET_FORMAT = /^[0-9a-f]{64}$/;

// Refusals per IP before the handshakes of that IP are refused outright, for the rest of the window.
export const HANDSHAKE_REFUSALS_PER_WINDOW = 20;
export const HANDSHAKE_WINDOW_MS = 60_000;
// A blocked IP still gets one handshake through this often, so the robots behind a shared address (a mall's
// Wi-Fi) get back in while someone there keeps sending bad tokens: at most 12 lookups a minute per blocked IP.
export const BLOCKED_IP_ATTEMPT_INTERVAL_MS = 5_000;

// A peer that ignores our close frame is dropped after this, instead of the ws default of 30 s. Until then ws
// still delivers its messages, which the gateways ignore once they started closing.
export const SOCKET_CLOSE_TIMEOUT_MS = 3_000;

// The client address as Express computes req.ip for the same TRUST_PROXY: false is the socket peer, true the
// leftmost X-Forwarded-For entry, a number that many trusted hops from the socket.
export function clientIp(req: IncomingMessage, trustProxy: boolean | number): string {
  const forwarded = (req.headers['x-forwarded-for'] ?? '')
    .toString()
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean)
    .reverse();
  const chain = [req.socket.remoteAddress ?? 'unknown', ...forwarded];
  if (trustProxy === false) return chain[0]!;
  if (trustProxy === true) return chain[chain.length - 1]!;
  return chain[Math.min(trustProxy, chain.length - 1)]!;
}

// IPs tracked at once; past this the oldest windows are dropped, so a flood of addresses cannot grow memory.
export const MAX_TRACKED_IPS = 10_000;

interface Window {
  refusals: number;
  endsAt: number;
  // When the blocked IP may try again; set when it gets blocked.
  nextAttemptAt: number;
}

// Counts refused handshakes per IP in memory (one API instance in v1). A blocked IP is refused before its token
// or ticket reaches the database or Redis, except for one attempt every BLOCKED_IP_ATTEMPT_INTERVAL_MS.
export class HandshakeLimiter {
  // Insertion order is age order: a new window is always appended, so the first entries are the oldest.
  private readonly windows = new Map<string, Window>();
  private nextPruneAt = 0;

  constructor(
    private readonly limit = HANDSHAKE_REFUSALS_PER_WINDOW,
    private readonly windowMs = HANDSHAKE_WINDOW_MS,
    private readonly attemptIntervalMs = BLOCKED_IP_ATTEMPT_INTERVAL_MS,
  ) {}

  isBlocked(ip: string, now = Date.now()): boolean {
    const window = this.current(ip, now);
    return window !== undefined && window.refusals >= this.limit;
  }

  // True when the handshake may go on to the database or Redis. A blocked IP gets its next attempt only when it
  // is due, and this call spends it; synchronous, so two handshakes never share one.
  admit(ip: string, now = Date.now()): boolean {
    const window = this.current(ip, now);
    if (!window || window.refusals < this.limit) return true;
    if (now < window.nextAttemptAt) return false;
    window.nextAttemptAt = now + this.attemptIntervalMs;
    return true;
  }

  // True when this refusal is the one that blocks the IP.
  recordRefusal(ip: string, now = Date.now()): boolean {
    let window = this.current(ip, now);
    if (!window) {
      window = { refusals: 0, endsAt: now + this.windowMs, nextAttemptAt: 0 };
      this.windows.set(ip, window);
      this.evict(now);
    }
    window.refusals += 1;
    if (window.refusals !== this.limit) return false;
    // The first attempt waits a full interval, so the burst that blocked the IP gets nothing more through.
    window.nextAttemptAt = now + this.attemptIntervalMs;
    return true;
  }

  private current(ip: string, now: number): Window | undefined {
    const window = this.windows.get(ip);
    if (window && window.endsAt <= now) {
      this.windows.delete(ip);
      return undefined;
    }
    return window;
  }

  // Expired windows go at most once per window length; past the cap, the oldest go regardless.
  private evict(now: number): void {
    if (now >= this.nextPruneAt) {
      this.nextPruneAt = now + this.windowMs;
      for (const [ip, window] of this.windows) if (window.endsAt <= now) this.windows.delete(ip);
    }
    for (const ip of this.windows.keys()) {
      if (this.windows.size <= MAX_TRACKED_IPS) break;
      this.windows.delete(ip);
    }
  }

  get trackedIps(): number {
    return this.windows.size;
  }
}
