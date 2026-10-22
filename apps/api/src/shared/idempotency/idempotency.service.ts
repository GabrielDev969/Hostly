import { Inject, Injectable, Optional } from '@nestjs/common';
import { IDEMPOTENCY_REDIS } from './constants';

export interface IdempotencyRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'PX', ttlMs: number, flag: 'NX'): Promise<'OK' | null>;
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<'OK'>;
  del(key: string): Promise<number>;
}

export type IdempotencyEntry =
  | { state: 'locked'; bodyHash: string }
  | { state: 'complete'; bodyHash: string; status: number; body: unknown };

@Injectable()
export class IdempotencyService {
  private readonly memory = new Map<string, { value: string; expiresAt: number }>();

  constructor(
    @Optional()
    @Inject(IDEMPOTENCY_REDIS)
    private readonly redis: IdempotencyRedis | null = null,
  ) {}

  async tryAcquireLock(key: string, bodyHash: string, lockTtlMs: number): Promise<boolean> {
    const payload = JSON.stringify({
      state: 'locked',
      bodyHash,
    } satisfies IdempotencyEntry);
    if (this.redis) {
      const result = await this.redis.set(key, payload, 'PX', lockTtlMs, 'NX');
      return result === 'OK';
    }
    return this.memorySetNx(key, payload, lockTtlMs);
  }

  async fetch(key: string): Promise<IdempotencyEntry | null> {
    const raw = this.redis ? await this.redis.get(key) : this.memoryGet(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as IdempotencyEntry;
    } catch {
      return null;
    }
  }

  async storeResponse(
    key: string,
    bodyHash: string,
    status: number,
    body: unknown,
    ttlMs: number,
  ): Promise<void> {
    const payload = JSON.stringify({
      state: 'complete',
      bodyHash,
      status,
      body,
    } satisfies IdempotencyEntry);
    if (this.redis) {
      await this.redis.set(key, payload, 'PX', ttlMs);
      return;
    }
    this.memorySet(key, payload, ttlMs);
  }

  async release(key: string): Promise<void> {
    if (this.redis) {
      await this.redis.del(key);
      return;
    }
    this.memory.delete(key);
  }

  private memorySetNx(key: string, value: string, ttlMs: number): boolean {
    this.gcMemory();
    if (this.memory.has(key)) return false;
    this.memory.set(key, { value, expiresAt: Date.now() + ttlMs });
    return true;
  }

  private memoryGet(key: string): string | null {
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return entry.value;
  }

  private memorySet(key: string, value: string, ttlMs: number): void {
    this.memory.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  private gcMemory(): void {
    const now = Date.now();
    for (const [k, v] of this.memory.entries()) {
      if (v.expiresAt < now) this.memory.delete(k);
    }
  }
}
