import { CacheService } from './cache.service';

type AsyncFn = (this: unknown, ...args: unknown[]) => Promise<unknown>;

interface CacheableHost {
  cacheService: CacheService;
}

export function InvalidateCache(...namespaces: string[]): MethodDecorator {
  return (_target, propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as AsyncFn;
    descriptor.value = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
      const result = await original.apply(this, args);
      const svc = (this as Partial<CacheableHost>)?.cacheService;
      if (!svc) {
        const cls = (this as { constructor?: { name?: string } })?.constructor?.name ?? 'unknown';
        throw new Error(
          `@InvalidateCache on ${cls}.${String(propertyKey)} requires the host class ` +
            `to inject CacheService and expose it as 'cacheService'.`,
        );
      }
      await Promise.all(namespaces.map((ns) => svc.bumpNamespace(ns)));
      return result;
    };
    return descriptor;
  };
}
