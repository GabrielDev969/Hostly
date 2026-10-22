import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InvitationsRepository } from '../repositories/invitations.repository.interface';

interface RevokeInvitationInput {
  invitationId: string;
  workspaceId: string;
}

@Injectable()
export class RevokeInvitationUseCase {
  constructor(private invitations: InvitationsRepository) {}

  async execute(input: RevokeInvitationInput): Promise<void> {
    const invitation = await this.invitations.findById(input.invitationId);
    if (!invitation || invitation.workspaceId !== input.workspaceId)
      throw new NotFoundException('Invitation not found in this workspace');
    if (invitation.acceptedAt)
      throw new BadRequestException('Invitation has already been accepted and cannot be revoked');

    await this.invitations.delete(input.invitationId);
  }
}
