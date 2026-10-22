import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InvitationsRepository } from '../repositories/invitations.repository.interface';
import { RolesRepository } from '@modules/rbac/repositories/roles.repository.interface';
import { ClientsRepository } from '@modules/clients/repositories/clients.repository.interface';
import { assertCanGrant, assertRoleFitsScope } from '@modules/rbac/constants/roles';
import { TenantContext } from '@shared/tenancy/tenant-context';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { WorkspaceMembersRepository } from '@modules/workspaces/repositories/workspace-members.repository.interface';
import { WorkspacesRepository } from '@modules/workspaces/repositories/workspaces.repository.interface';
import { CryptoUtil } from '@shared/utils/crypto.util';
import { EmailDispatcher } from '@shared/mailer/email-dispatcher.service';
import { buildAcceptInvitationUrl, invitationEmail } from '@shared/mailer/templates';
import { InvitationResponseDto, toInvitationDto } from '../http/dto/invitation-response.dto';

const INVITATION_TTL_DAYS = 7;

interface SendInvitationInput {
  workspaceId: string;
  email: string;
  roleId: string;
  clientId: string | null;
  invitedById: string;
}

@Injectable()
export class SendInvitationUseCase {
  constructor(
    private invitations: InvitationsRepository,
    private roles: RolesRepository,
    private users: UsersRepository,
    private members: WorkspaceMembersRepository,
    private workspaces: WorkspacesRepository,
    private clients: ClientsRepository,
    private emailDispatcher: EmailDispatcher,
  ) {}

  async execute(input: SendInvitationInput): Promise<InvitationResponseDto> {
    const role = await this.roles.findByIdInWorkspace(input.roleId, input.workspaceId);
    if (!role) throw new NotFoundException('Role not found in this workspace');
    // Advertiser invitations arrive with the Advertiser table.
    const membership = { clientId: input.clientId, advertiserId: null };
    assertCanGrant(TenantContext.scope, membership);
    assertRoleFitsScope(role, membership);
    if (input.clientId && !(await this.clients.findById(input.clientId))) {
      throw new NotFoundException('Client not found');
    }

    const existingUser = await this.users.findByEmail(input.email);
    if (existingUser) {
      const membership = await this.members.findByUserAndWorkspace(
        existingUser.id,
        input.workspaceId,
      );
      if (membership) throw new ConflictException('User is already a member of this workspace');
    }

    const pending = await this.invitations.findPendingByEmailAndWorkspace(
      input.email,
      input.workspaceId,
    );
    if (pending) throw new ConflictException('A pending invitation already exists for this email');

    const rawToken = CryptoUtil.generateToken(32);
    const tokenHash = CryptoUtil.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

    const invitation = await this.invitations.create({
      email: input.email,
      workspaceId: input.workspaceId,
      roleId: input.roleId,
      invitedById: input.invitedById,
      clientId: input.clientId,
      tokenHash,
      expiresAt,
    });

    const [workspace, inviter] = await Promise.all([
      this.workspaces.findById(input.workspaceId),
      this.users.findById(input.invitedById),
    ]);
    const message = invitationEmail({
      workspaceName: workspace?.name ?? 'a workspace',
      invitedBy: inviter?.name ?? 'A teammate',
      acceptUrl: buildAcceptInvitationUrl(rawToken),
    });
    await this.emailDispatcher.enqueue({ to: input.email, ...message });

    return toInvitationDto(invitation, { rawToken });
  }
}
