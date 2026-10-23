import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InvitationsRepository } from '../repositories/invitations.repository.interface';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { WorkspaceMembersRepository } from '@modules/workspaces/repositories/workspace-members.repository.interface';
import { RolesRepository } from '@modules/rbac/repositories/roles.repository.interface';
import { assertRoleFitsScope } from '@modules/rbac/constants/roles';
import { CryptoUtil } from '@shared/utils/crypto.util';

interface AcceptInvitationInput {
  token: string;
  userId: string;
}

interface AcceptInvitationResult {
  workspaceId: string;
  roleId: string;
}

@Injectable()
export class AcceptInvitationUseCase {
  constructor(
    private invitations: InvitationsRepository,
    private users: UsersRepository,
    private members: WorkspaceMembersRepository,
    private roles: RolesRepository,
  ) {}

  async execute(input: AcceptInvitationInput): Promise<AcceptInvitationResult> {
    const tokenHash = CryptoUtil.hashToken(input.token);
    const invitation = await this.invitations.findByTokenHash(tokenHash);
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.acceptedAt)
      throw new BadRequestException('Invitation has already been accepted');
    if (invitation.expiresAt < new Date()) throw new BadRequestException('Invitation has expired');

    const user = await this.users.findById(input.userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.email !== invitation.email)
      throw new ForbiddenException('This invitation was sent to a different email');

    const existingMembership = await this.members.findByUserAndWorkspace(
      input.userId,
      invitation.workspaceId,
    );
    if (existingMembership)
      throw new ConflictException('You are already a member of this workspace');

    // The role and the client may have changed since the invitation was sent.
    const role = await this.roles.findByIdInWorkspace(invitation.roleId, invitation.workspaceId);
    if (!role) throw new ConflictException('The role of this invitation no longer exists');
    assertRoleFitsScope(role, { clientId: invitation.clientId, advertiserId: null });

    const created = await this.members.createFromInvitation({
      invitationId: invitation.id,
      userId: input.userId,
      workspaceId: invitation.workspaceId,
      roleId: invitation.roleId,
      clientId: invitation.clientId,
      now: new Date(),
    });
    if (created.status === 'client_gone') {
      throw new ConflictException('The client of this invitation no longer exists');
    }
    if (created.status === 'not_pending') {
      throw new BadRequestException('Invitation is no longer pending');
    }

    return {
      workspaceId: invitation.workspaceId,
      roleId: invitation.roleId,
    };
  }
}
