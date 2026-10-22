import { TenantContext } from '@shared/tenancy/tenant-context';
import { CacheService } from './cache.service';

export interface CacheableOptions<TArgs extends unknown[]> {
  namespace: string;
  key: (...args: TArgs) => string;
  ttlMs: number;
}

type AsyncFn<TArgs extends unknown[]> = (this: unknown, ...args: TArgs) => Promise<unknown>;

interface CacheableHost {
  cacheService: CacheService;
}

function readCacheService(host: unknown, methodName: string | symbol): CacheService {
  const svc = (host as Partial<CacheableHost>)?.cacheService;
  if (!svc) {
    const cls = (host as { constructor?: { name?: string } })?.constructor?.name ?? 'unknown';
    throw new Error(
      `@Cacheable on ${cls}.${String(methodName)} requires the host class to ` +
        `inject CacheService and expose it as 'cacheService' (e.g. ` +
        `'protected readonly cacheService: CacheService' in the constructor).`,
    );
  }
  return svc;
}

export function Cacheable<TArgs extends unknown[]>(
  options: CacheableOptions<TArgs>,
): MethodDecorator {
  return (_target, propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as AsyncFn<TArgs>;
    const invoke = (self: unknown, args: TArgs): Promise<unknown> => original.apply(self, args);
    descriptor.value = async function (this: unknown, ...args: TArgs): Promise<unknown> {
      const svc = readCacheService(this, propertyKey);
      // A result cached for one tenant scope must never be served to another.
      const scopedKey = TenantContext.cacheKeyPrefix() + options.key(...args);
      const finalKey = await svc.buildKey(options.namespace, scopedKey);
      return svc.wrap(finalKey, () => invoke(this, args), options.ttlMs);
    };
    return descriptor;
  };
}
