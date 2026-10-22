import { Inject, Injectable, Optional } from '@nestjs/common';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';

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

  async get<T>(key: string): Promise<T | null> {
    return (await this.cache.get<T>(key)) ?? null;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    await this.cache.set(key, value, ttlMs);
  }

  async del(key: string): Promise<void> {
    await this.cache.del(key);
  }

  async wrap<T>(key: string, fn: () => Promise<T>, ttlMs: number): Promise<T> {
    const cached = await this.cache.get<T>(key);
    if (cached !== null && cached !== undefined) return cached;
    const value = await fn();
    await this.cache.set(key, value, ttlMs);
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
    return `${namespace}:v${version}:${suffix}`;
  }

  private versionKey(namespace: string): string {
    return `__nsver__:${namespace}`;
  }
}
