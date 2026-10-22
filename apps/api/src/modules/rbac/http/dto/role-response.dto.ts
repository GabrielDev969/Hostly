import { ApiProperty } from '@nestjs/swagger';
import { RoleWithPermissions } from '../../repositories/roles.repository.interface';

export class RolePermissionDto {
  @ApiProperty({ example: 'user:delete' })
  key: string;

  @ApiProperty({
    nullable: true,
    example: 'Allow deleting users in the workspace',
  })
  description: string | null;

  @ApiProperty({ example: 'user' })
  category: string;
}

export class RoleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Admin' })
  name: string;

  @ApiProperty({ nullable: true, example: 'Workspace administrators' })
  description: string | null;

  @ApiProperty({
    example: false,
    description: 'System roles (Owner, Admin, Member) cannot be modified or deleted',
  })
  isSystem: boolean;

  @ApiProperty({ type: [RolePermissionDto] })
  permissions: RolePermissionDto[];

  @ApiProperty({ example: '2026-05-09T12:34:56.789Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-05-09T12:34:56.789Z' })
  updatedAt: Date;
}

export function toRoleDto(role: RoleWithPermissions): RoleResponseDto {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.permissions.map((p) => ({
      key: p.key,
      description: p.description,
      category: p.category,
    })),
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}
