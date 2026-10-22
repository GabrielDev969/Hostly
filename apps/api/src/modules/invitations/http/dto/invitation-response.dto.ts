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
    description: 'Acceptance token. Only returned on creation.',
    required: false,
    example: 'inv_8f3a91c2-...',
  })
  token?: string;

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

export function toInvitationDto(
  invitation: Invitation,
  options: { rawToken?: string } = {},
): InvitationResponseDto {
  return {
    id: invitation.id,
    email: invitation.email,
    workspaceId: invitation.workspaceId,
    roleId: invitation.roleId,
    invitedById: invitation.invitedById,
    ...(options.rawToken ? { token: options.rawToken } : {}),
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
    createdAt: invitation.createdAt,
  };
}
