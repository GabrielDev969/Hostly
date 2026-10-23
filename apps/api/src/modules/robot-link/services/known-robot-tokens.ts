import type { RobotTokenChange } from '@modules/robots/services/robot-token-events.service';

// Hashes kept at once; past this the least recently authenticated go, so memory stays bounded.
export const MAX_KNOWN_TOKENS = 10_000;
// A known hash skips the IP block, so it gets a pace of its own: a stolen token cannot hammer the database.
export const KNOWN_TOKEN_ATTEMPT_INTERVAL_MS = 2_000;

interface KnownToken {
  robotId: string;
  nextAttemptAt: number;
}

// Token hashes that authenticated on this instance (memory, one API instance in v1; empty after a restart). A robot
// that connected before gets past a blocked IP without waiting behind strangers on the same address. It only
// skips the block: every handshake still authenticates the token against the database.
export class KnownRobotTokens {
  // Insertion order is recency order: remember() appends, so the first entries are the stalest.
  private readonly tokens = new Map<string, KnownToken>();

  constructor(private readonly attemptIntervalMs = KNOWN_TOKEN_ATTEMPT_INTERVAL_MS) {}

  // For a handshake from a blocked IP: undefined when the hash is not known, otherwise true at most once per
  // interval (this call spends it).
  admit(tokenHash: string, now = Date.now()): boolean | undefined {
    const known = this.tokens.get(tokenHash);
    if (!known) return undefined;
    if (now < known.nextAttemptAt) return false;
    known.nextAttemptAt = now + this.attemptIntervalMs;
    return true;
  }

  remember(robotId: string, tokenHash: string): void {
    const known = this.tokens.get(tokenHash);
    this.tokens.delete(tokenHash);
    this.tokens.set(tokenHash, { robotId, nextAttemptAt: known?.nextAttemptAt ?? 0 });
    for (const hash of this.tokens.keys()) {
      if (this.tokens.size <= MAX_KNOWN_TOKENS) break;
      this.tokens.delete(hash);
    }
  }

  forget(tokenHash: string): void {
    this.tokens.delete(tokenHash);
  }

  // A revoked or replaced token stops being known at once.
  apply(change: RobotTokenChange): void {
    for (const [hash, known] of this.tokens) {
      if (known.robotId === change.robotId && hash !== change.activeTokenHash)
        this.tokens.delete(hash);
    }
  }

  get size(): number {
    return this.tokens.size;
  }
}
