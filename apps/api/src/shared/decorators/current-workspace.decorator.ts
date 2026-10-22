import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface CurrentWorkspacePayload {
  id: string;
  member: {
    id: string;
    userId: string;
    workspaceId: string;
    roleId: string;
  };
  role: {
    id: string;
    name: string;
    isSystem: boolean;
  };
}

export const CurrentWorkspace = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request & { workspace: CurrentWorkspacePayload }>();

  return request.workspace;
});
