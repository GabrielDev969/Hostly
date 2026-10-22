import { Injectable } from '@nestjs/common';
import { InvitationsRepository } from '../repositories/invitations.repository.interface';
import { InvitationResponseDto, toInvitationDto } from '../http/dto/invitation-response.dto';

@Injectable()
export class ListInvitationsUseCase {
  constructor(private invitations: InvitationsRepository) {}

  async execute(workspaceId: string): Promise<InvitationResponseDto[]> {
    const items = await this.invitations.findManyByWorkspace(workspaceId);
    return items.map((i) => toInvitationDto(i));
  }
}
