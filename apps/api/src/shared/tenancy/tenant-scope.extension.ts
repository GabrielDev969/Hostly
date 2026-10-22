import { Prisma } from '@prisma/client';
import { TenantContext } from './tenant-context';
import { TenantScopeRewriter } from './tenant-scope.rewriter';

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
  },
});
