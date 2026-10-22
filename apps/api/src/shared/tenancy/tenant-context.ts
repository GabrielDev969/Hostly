import { AsyncLocalStorage } from 'async_hooks';
import type { TenantScope } from './tenant-scope';

interface TenantStore {
  scope: TenantScope | null;
  system: boolean;
}

// Static because the Prisma extension and the cache decorators run outside Nest's DI.
export class TenantContext {
  private static readonly storage = new AsyncLocalStorage<TenantStore>();

  static run<T>(fn: () => T): T {
    return TenantContext.storage.run({ scope: null, system: false }, fn);
  }

  // Prisma queries are lazy thenables that run when awaited, so the await must happen inside the context.
  static runWithScope<T>(scope: TenantScope, fn: () => PromiseLike<T> | T): Promise<T> {
    return TenantContext.storage.run({ scope, system: false }, async () => await fn());
  }

  // Seed, scheduled jobs and identity lookups that legitimately span tenants.
  static runAsSystem<T>(fn: () => PromiseLike<T> | T): Promise<T> {
    return TenantContext.storage.run({ scope: null, system: true }, async () => await fn());
  }

  static setScope(scope: TenantScope): void {
    const store = TenantContext.storage.getStore();
    if (!store) throw new Error('TenantContext.setScope called outside a request context');
    store.scope = scope;
  }

  static get scope(): TenantScope | null {
    return TenantContext.storage.getStore()?.scope ?? null;
  }

  static get isSystem(): boolean {
    return TenantContext.storage.getStore()?.system ?? false;
  }

  static cacheKeyPrefix(): string {
    const scope = TenantContext.scope;
    if (!scope) return '';
    return `scope:${scope.organizationId}:${scope.clientId ?? '-'}:${scope.advertiserId ?? '-'}:`;
  }
}
