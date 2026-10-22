import { Prisma } from '@prisma/client';
import { TenantContext } from './tenant-context';
import { TenantScopeError, TenantScopeRewriter } from './tenant-scope.rewriter';

// The rewriter cannot see inside SQL, so raw queries only run as system work.
const rejectRawOutsideSystem = (operation: string): void => {
  if (!TenantContext.isSystem) {
    throw new TenantScopeError(`${operation} bypasses the tenant scope; use model delegates`);
  }
};

export const tenantScopeExtension = Prisma.defineExtension({
  name: 'tenant-scope',
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        if (TenantContext.isSystem) return query(args);
        const rewritten = new TenantScopeRewriter(TenantContext.scope).rewrite(
          model,
          operation,
          args,
        );
        return query(rewritten);
      },
    },
    $queryRaw({ args, query }) {
      rejectRawOutsideSystem('$queryRaw');
      return query(args);
    },
    $executeRaw({ args, query }) {
      rejectRawOutsideSystem('$executeRaw');
      return query(args);
    },
    $queryRawUnsafe({ args, query }) {
      rejectRawOutsideSystem('$queryRawUnsafe');
      return query(args);
    },
    $executeRawUnsafe({ args, query }) {
      rejectRawOutsideSystem('$executeRawUnsafe');
      return query(args);
    },
  },
});
