import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { WorkspaceMembersRepository } from '@modules/workspaces/repositories/workspace-members.repository.interface';

export interface WorkspaceRequest extends Request {
  user?: { id: string };
  workspace?: {
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
  };
  permissions?: unknown;
}

@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(private members: WorkspaceMembersRepository) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<WorkspaceRequest>();
    const user = req.user;
    if (!user) return false;

    const rawWorkspaceId = req.headers['x-workspace-id'] || req.params['workspaceId'];

    const workspaceId = Array.isArray(rawWorkspaceId) ? rawWorkspaceId[0] : rawWorkspaceId;

    if (!workspaceId) throw new BadRequestException('Workspace not specified');

    const member =
      (await this.members.findByUserAndWorkspace(user.id, workspaceId)) ??
      (await this.members.findSuperAdminMembership(user.id));

    if (!member) throw new ForbiddenException('You are not a member of this workspace');

    req.workspace = {
      id: workspaceId,
      member: {
        id: member.id,
        userId: member.userId,
        workspaceId: member.workspaceId,
        roleId: member.roleId,
      },
      role: {
        id: member.role.id,
        name: member.role.name,
        isSystem: member.role.isSystem,
      },
    };

    req.permissions = member.role.permissions;
    return true;
  }
}
