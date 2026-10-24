import { Inject, Injectable, Optional } from '@nestjs/common';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { CACHE_VALUE_FORMAT } from './cache.constants';
import { deserializeCacheValue, serializeCacheValue } from './cache-serialization';

export const CACHE_NSVER_REDIS = 'CACHE_NSVER_REDIS';

export interface NamespaceVersionPipeline {
  setnx(key: string, value: string): NamespaceVersionPipeline;
  incr(key: string): NamespaceVersionPipeline;
  exec(): Promise<unknown>;
}

export interface NamespaceVersionStore {
  get(key: string): Promise<string | null>;
  multi(): NamespaceVersionPipeline;
}

@Injectable()
export class CacheService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @Optional()
    @Inject(CACHE_NSVER_REDIS)
    private readonly nsverRedis: NamespaceVersionStore | null = null,
  ) {}

  // Every store, the in-memory one of the tests included, holds the serialized text, so a hit reads what Redis gives.
  // Whatever does not decode is a miss: the caller goes to the database instead of getting a corrupt value.
  async get<T>(key: string): Promise<T | null> {
    const raw = await this.cache.get<unknown>(key);
    if (typeof raw !== 'string') return null;
    try {
      return (deserializeCacheValue(raw) as T | undefined) ?? null;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    await this.cache.set(key, serializeCacheValue(value), ttlMs);
  }

  async del(key: string): Promise<void> {
    await this.cache.del(key);
  }

  async wrap<T>(key: string, fn: () => Promise<T>, ttlMs: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await fn();
    await this.set(key, value, ttlMs);
    return value;
  }

  async getNamespaceVersion(namespace: string): Promise<number> {
    if (this.nsverRedis) {
      const raw = await this.nsverRedis.get(this.versionKey(namespace));
      const n = raw === null ? NaN : Number(raw);
      return Number.isInteger(n) && n > 0 ? n : 1;
    }
    const v = await this.cache.get<number>(this.versionKey(namespace));
    return typeof v === 'number' ? v : 1;
  }

  async bumpNamespace(namespace: string): Promise<void> {
    const key = this.versionKey(namespace);
    if (this.nsverRedis) {
      await this.nsverRedis.multi().setnx(key, '1').incr(key).exec();
      return;
    }
    const next = (await this.getNamespaceVersion(namespace)) + 1;
    await this.cache.set(key, next);
  }

  async buildKey(namespace: string, suffix: string): Promise<string> {
    const version = await this.getNamespaceVersion(namespace);
    return `${namespace}:${CACHE_VALUE_FORMAT}:v${version}:${suffix}`;
  }

  private versionKey(namespace: string): string {
    return `__nsver__:${namespace}`;
  }
}
