import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { WorkspaceMembersRepository } from '../repositories/workspace-members.repository.interface';
import { WorkspacesRepository } from '../repositories/workspaces.repository.interface';
import { RolesRepository } from '@modules/rbac/repositories/roles.repository.interface';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { CryptoUtil } from '@shared/utils/crypto.util';

interface TransferOwnershipInput {
  workspaceId: string;
  callerUserId: string;
  targetMemberId: string;
  password: string;
}

@Injectable()
export class TransferOwnershipUseCase {
  constructor(
    private readonly workspaces: WorkspacesRepository,
    private readonly members: WorkspaceMembersRepository,
    private readonly roles: RolesRepository,
    private readonly users: UsersRepository,
  ) {}

  async execute(input: TransferOwnershipInput): Promise<void> {
    const workspace = await this.workspaces.findById(input.workspaceId);
    if (!workspace) throw new NotFoundException('Workspace not found');
    if (workspace.ownerId !== input.callerUserId) {
      throw new ForbiddenException('Only the current owner can transfer ownership');
    }

    const caller = await this.users.findById(input.callerUserId);
    if (
      !caller ||
      !caller.passwordHash ||
      !(await CryptoUtil.verifyPassword(caller.passwordHash, input.password))
    ) {
      throw new UnauthorizedException('Invalid password');
    }

    const target = await this.members.findById(input.targetMemberId);
    if (!target || target.workspaceId !== input.workspaceId) {
      throw new NotFoundException('Target member not found in this workspace');
    }
    if (target.userId === input.callerUserId) {
      throw new BadRequestException('Cannot transfer ownership to yourself');
    }

    const workspaceRoles = await this.roles.findManyByWorkspace(input.workspaceId);
    const ownerRole = workspaceRoles.find((r) => r.name === 'Owner');
    const adminRole = workspaceRoles.find((r) => r.name === 'Admin');
    if (!ownerRole || !adminRole) {
      throw new BadRequestException('Workspace is missing the default Owner/Admin roles');
    }

    await this.workspaces.transferOwnership({
      workspaceId: input.workspaceId,
      fromUserId: input.callerUserId,
      toUserId: target.userId,
      ownerRoleId: ownerRole.id,
      adminRoleId: adminRole.id,
    });
    await this.users.invalidateTokens(input.callerUserId);
    await this.users.invalidateTokens(target.userId);
  }
}
