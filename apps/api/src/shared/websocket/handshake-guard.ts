import type { IncomingMessage } from 'http';

// Device tokens and panel tickets are CryptoUtil.generateToken(32): anything else is refused before any I/O.
export const SECRET_FORMAT = /^[0-9a-f]{64}$/;

// Refusals per IP before the handshakes of that IP are refused outright, for the rest of the window.
export const HANDSHAKE_REFUSALS_PER_WINDOW = 20;
export const HANDSHAKE_WINDOW_MS = 60_000;

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

interface Window {
  refusals: number;
  endsAt: number;
}

// Counts refused handshakes per IP in memory (one API instance in v1). A blocked IP is refused before its token
// or ticket reaches the database or Redis, so a burst of bad handshakes costs no I/O.
export class HandshakeLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit = HANDSHAKE_REFUSALS_PER_WINDOW,
    private readonly windowMs = HANDSHAKE_WINDOW_MS,
  ) {}

  isBlocked(ip: string, now = Date.now()): boolean {
    const window = this.current(ip, now);
    return window !== undefined && window.refusals >= this.limit;
  }

  // True when this refusal is the one that blocks the IP.
  recordRefusal(ip: string, now = Date.now()): boolean {
    const window = this.current(ip, now) ?? { refusals: 0, endsAt: now + this.windowMs };
    window.refusals += 1;
    this.windows.set(ip, window);
    if (this.windows.size > 10_000) this.prune(now);
    return window.refusals === this.limit;
  }

  private current(ip: string, now: number): Window | undefined {
    const window = this.windows.get(ip);
    if (window && window.endsAt <= now) {
      this.windows.delete(ip);
      return undefined;
    }
    return window;
  }

  private prune(now: number): void {
    for (const [ip, window] of this.windows) if (window.endsAt <= now) this.windows.delete(ip);
  }
}
