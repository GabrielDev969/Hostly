import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { WorkspaceMembersRepository } from '../repositories/workspace-members.repository.interface';
import { WorkspacesRepository } from '../repositories/workspaces.repository.interface';
import { PERMISSIONS } from '@modules/rbac/constants/permissions';

interface RemoveMemberInput {
  workspaceId: string;
  memberId: string;
  callerUserId: string;
  callerPermissions: string[];
}

@Injectable()
export class RemoveMemberUseCase {
  constructor(
    private readonly members: WorkspaceMembersRepository,
    private readonly workspaces: WorkspacesRepository,
  ) {}

  async execute(input: RemoveMemberInput): Promise<void> {
    const member = await this.members.findById(input.memberId);
    if (!member || member.workspaceId !== input.workspaceId) {
      throw new NotFoundException('Member not found in this workspace');
    }

    const workspace = await this.workspaces.findById(input.workspaceId);
    if (workspace?.ownerId === member.userId) {
      throw new ForbiddenException('Cannot remove the workspace owner; transfer ownership first');
    }

    const isSelf = member.userId === input.callerUserId;
    if (!isSelf && !input.callerPermissions.includes(PERMISSIONS.WORKSPACE.REMOVE_MEMBER)) {
      throw new ForbiddenException('Missing permission to remove members');
    }

    await this.members.delete(input.memberId);
  }
}
