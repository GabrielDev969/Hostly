import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export const CurrentPermissions = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string[] => {
    const request = ctx.switchToHttp().getRequest<Request & { permissions?: string[] }>();
    return request.permissions ?? [];
  },
);
