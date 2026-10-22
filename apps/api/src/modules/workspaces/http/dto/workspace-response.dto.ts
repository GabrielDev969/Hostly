import { ApiProperty } from '@nestjs/swagger';
import { Workspace } from '../../entities/workspace.entity';

export class WorkspaceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Acme Inc.' })
  name: string;

  @ApiProperty({
    example: 'acme-inc',
    description: 'URL-safe identifier; unique across workspaces',
  })
  slug: string;

  @ApiProperty({
    example: false,
    description: "True for the user's auto-provisioned personal workspace",
  })
  isPersonal: boolean;

  @ApiProperty({ format: 'uuid' })
  ownerId: string;

  @ApiProperty({ example: '2026-05-09T12:34:56.789Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-05-09T12:34:56.789Z' })
  updatedAt: Date;
}

export function toWorkspaceDto(workspace: Workspace): WorkspaceResponseDto {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    isPersonal: workspace.isPersonal,
    ownerId: workspace.ownerId,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };
}
