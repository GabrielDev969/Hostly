import { TenantContext } from './tenant-context';
import type { TenantScope } from './tenant-scope';

const scope: TenantScope = {
  organizationId: 'org1',
  workspaceId: 'w1',
  clientId: 'client-a',
  advertiserId: null,
};

// Mimics a PrismaPromise: nothing runs until then() is called.
const lazy = (): PromiseLike<TenantScope | null> => ({
  then: (resolve, reject) => Promise.resolve(TenantContext.scope).then(resolve, reject),
});

describe('TenantContext', () => {
  it('resolves lazy thenables while the scope is still active', async () => {
    await expect(TenantContext.runWithScope(scope, lazy)).resolves.toEqual(scope);
    expect(TenantContext.scope).toBeNull();
  });

  it('marks system work and keeps it out of scoped cache keys', async () => {
    const seen = await TenantContext.runAsSystem(() => ({
      system: TenantContext.isSystem,
      prefix: TenantContext.cacheKeyPrefix(),
    }));
    expect(seen).toEqual({ system: true, prefix: '' });
  });

  it('only lets the guard set a scope inside a request context', () => {
    expect(() => TenantContext.setScope(scope)).toThrow('outside a request context');
    TenantContext.run(() => {
      TenantContext.setScope(scope);
      expect(TenantContext.cacheKeyPrefix()).toBe('scope:org1:client-a:-:');
    });
  });
});
