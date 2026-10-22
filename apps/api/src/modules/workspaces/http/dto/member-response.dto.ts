import { ApiProperty } from '@nestjs/swagger';
import { WorkspaceMemberListItem } from '../../repositories/workspace-members.repository.interface';

export class WorkspaceMemberUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;
}

export class WorkspaceMemberRoleDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  isSystem: boolean;
}

export class WorkspaceMemberResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ format: 'uuid' })
  workspaceId: string;

  @ApiProperty({ format: 'uuid' })
  roleId: string;

  @ApiProperty()
  joinedAt: Date;

  @ApiProperty({ type: WorkspaceMemberUserDto })
  user: WorkspaceMemberUserDto;

  @ApiProperty({ type: WorkspaceMemberRoleDto })
  role: WorkspaceMemberRoleDto;
}

export function toMemberDto(member: WorkspaceMemberListItem): WorkspaceMemberResponseDto {
  return {
    id: member.id,
    userId: member.userId,
    workspaceId: member.workspaceId,
    roleId: member.roleId,
    joinedAt: member.joinedAt,
    user: member.user,
    role: member.role,
  };
}
