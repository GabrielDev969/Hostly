import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import type { TenantScope } from '@shared/tenancy/tenant-scope';

// Only routes behind WorkspaceGuard carry a scope; anything else fails closed.
export const CurrentScope = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TenantScope => {
    const scope = ctx.switchToHttp().getRequest<Request & { scope?: TenantScope }>().scope;
    if (!scope) throw new ForbiddenException('Workspace scope not resolved');
    return scope;
  },
);
