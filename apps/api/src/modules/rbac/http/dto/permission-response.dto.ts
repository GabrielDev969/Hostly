import { ApiProperty } from '@nestjs/swagger';
import { Permission } from '../../entities/permission.entity';

export class PermissionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  key: string;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty()
  category: string;

  @ApiProperty({
    nullable: true,
    description: 'null when the permission is global/system-defined',
  })
  workspaceId: string | null;
}

export function toPermissionDto(p: Permission): PermissionResponseDto {
  return {
    id: p.id,
    key: p.key,
    description: p.description,
    category: p.category,
    workspaceId: p.workspaceId,
  };
}
