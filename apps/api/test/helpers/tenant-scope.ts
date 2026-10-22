import { TenantContext } from '../../src/shared/tenancy/tenant-context';
import type { TenantScope } from '../../src/shared/tenancy/tenant-scope';

export const OPERATOR_SCOPE: TenantScope = {
  organizationId: 'org1',
  workspaceId: 'w1',
  clientId: null,
  advertiserId: null,
};

// Runs every method of a use case inside a tenant scope, as the WorkspaceGuard would.
export function inScope<T extends object>(target: T, scope: TenantScope = OPERATOR_SCOPE): T {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      const value: unknown = Reflect.get(obj, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) =>
        TenantContext.runWithScope(scope, () =>
          (value as (...a: unknown[]) => unknown).apply(obj, args),
        );
    },
  });
}
