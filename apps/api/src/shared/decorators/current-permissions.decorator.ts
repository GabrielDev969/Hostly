import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { withinCeiling } from '@modules/rbac/constants/roles';
import type { TenantScope } from '@shared/tenancy/tenant-scope';

export const CurrentPermissions = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string[] => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { permissions?: string[]; scope?: TenantScope }>();
    return withinCeiling(request.permissions ?? [], request.scope);
  },
);
