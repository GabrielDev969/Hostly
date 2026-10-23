import { ApiProperty } from '@nestjs/swagger';
import { Invitation } from '../../entities/invitation.entity';

export class InvitationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'newmember@company.com' })
  email: string;

  @ApiProperty({ format: 'uuid' })
  workspaceId: string;

  @ApiProperty({ format: 'uuid' })
  roleId: string;

  @ApiProperty({ format: 'uuid' })
  invitedById: string;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'Client the new member will belong to; null for an operator member',
  })
  clientId: string | null;

  @ApiProperty({ example: '2026-05-16T12:34:56.789Z' })
  expiresAt: Date;

  @ApiProperty({
    nullable: true,
    example: null,
    description: 'When the invitation was accepted; null if pending',
  })
  acceptedAt: Date | null;

  @ApiProperty({ example: '2026-05-09T12:34:56.789Z' })
  createdAt: Date;
}

// Never carries the acceptance token: it goes only in the email, so no response, cache or proxy holds it.
export function toInvitationDto(invitation: Invitation): InvitationResponseDto {
  return {
    id: invitation.id,
    email: invitation.email,
    workspaceId: invitation.workspaceId,
    roleId: invitation.roleId,
    invitedById: invitation.invitedById,
    clientId: invitation.clientId,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
    createdAt: invitation.createdAt,
  };
}
