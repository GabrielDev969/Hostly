import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { WorkspaceMembersRepository } from '@modules/workspaces/repositories/workspace-members.repository.interface';
import { WorkspacesRepository } from '@modules/workspaces/repositories/workspaces.repository.interface';
import { TenantContext } from '@shared/tenancy/tenant-context';
import type { TenantScope } from '@shared/tenancy/tenant-scope';

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
  scope?: TenantScope;
}

@Injectable()
export class WorkspaceGuard implements CanActivate {
  private readonly uuid = new ParseUUIDPipe();

  constructor(
    private members: WorkspaceMembersRepository,
    private workspaces: WorkspacesRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<WorkspaceRequest>();
    const user = req.user;
    if (!user) return false;

    const header = req.headers['x-workspace-id'];
    const param = req.params['workspaceId'];

    // Refused before any membership lookup, so the answer is the same whoever the caller belongs to.
    if (header && param && header !== param) {
      throw new BadRequestException('x-workspace-id does not match the workspace in the URL');
    }

    const rawWorkspaceId = header || param;
    if (!rawWorkspaceId) throw new BadRequestException('Workspace not specified');

    // Node joins a repeated header into "A, B"; anything but a single UUID is refused.
    if (Array.isArray(rawWorkspaceId)) {
      throw new BadRequestException('x-workspace-id must be a single UUID');
    }
    const workspaceId = await this.uuid.transform(rawWorkspaceId, { type: 'custom' });

    const direct = await this.members.findByUserAndWorkspace(user.id, workspaceId);
    const member = direct ?? (await this.members.findSuperAdminMembership(user.id));

    if (!member) throw new ForbiddenException('You are not a member of this workspace');

    const scope = direct
      ? {
          organizationId: direct.organizationId,
          workspaceId,
          clientId: direct.clientId,
          advertiserId: direct.advertiserId,
        }
      : await this.superAdminScope(workspaceId);

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
    req.scope = scope;
    TenantContext.setScope(scope);
    return true;
  }

  // Super admins act as operators of the target workspace's organization.
  private async superAdminScope(workspaceId: string): Promise<TenantScope> {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) throw new NotFoundException('Workspace not found');
    return {
      organizationId: workspace.organizationId,
      workspaceId,
      clientId: null,
      advertiserId: null,
    };
  }
}
