import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceMembersRepository } from '../repositories/workspace-members.repository.interface';
import { WorkspacesRepository } from '../repositories/workspaces.repository.interface';
import { RolesRepository } from '@modules/rbac/repositories/roles.repository.interface';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { WorkspaceMember } from '../entities/workspace-member.entity';
import { assertRoleFitsScope } from '@modules/rbac/constants/roles';

interface UpdateMemberRoleInput {
  workspaceId: string;
  memberId: string;
  roleId: string;
}

@Injectable()
export class UpdateMemberRoleUseCase {
  constructor(
    private readonly members: WorkspaceMembersRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly roles: RolesRepository,
    private readonly users: UsersRepository,
  ) {}

  async execute(input: UpdateMemberRoleInput): Promise<WorkspaceMember> {
    const member = await this.members.findById(input.memberId);
    if (!member || member.workspaceId !== input.workspaceId) {
      throw new NotFoundException('Member not found in this workspace');
    }

    const workspace = await this.workspaces.findById(input.workspaceId);
    if (workspace?.ownerId === member.userId) {
      throw new ForbiddenException('Cannot modify the workspace owner; transfer ownership first');
    }

    const role = await this.roles.findByIdInWorkspace(input.roleId, input.workspaceId);
    if (!role) {
      throw new BadRequestException('Role not found in this workspace');
    }
    assertRoleFitsScope(role.name, member);

    const updated = await this.members.updateRole(input.memberId, input.roleId);
    await this.users.invalidateTokens(member.userId);
    return updated;
  }
}
