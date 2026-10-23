import { ApiProperty } from '@nestjs/swagger';
import { scopeKindOf, type ScopeKind } from '@modules/rbac/constants/roles';
import type { TenantScope } from '@shared/tenancy/tenant-scope';
import type { WorkspaceContext } from '@shared/types/workspace-context.type';

const SCOPE_KINDS: ScopeKind[] = ['operator', 'client', 'advertiser'];

export class WorkspaceMeRoleDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'operator_admin' })
  name: string;

  @ApiProperty({ example: true })
  isSystem: boolean;
}

export class WorkspaceMeScopeDto {
  @ApiProperty({ enum: SCOPE_KINDS, example: 'operator' })
  kind: ScopeKind;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  clientId: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  advertiserId: string | null;
}

export class WorkspaceMeResponseDto {
  @ApiProperty({ format: 'uuid' })
  workspaceId: string;

  @ApiProperty({ type: WorkspaceMeRoleDto })
  role: WorkspaceMeRoleDto;

  @ApiProperty({ type: WorkspaceMeScopeDto })
  scope: WorkspaceMeScopeDto;

  @ApiProperty({
    type: [String],
    example: ['client:read', 'robot:read'],
    description: 'Effective permissions: the role ones cut down to the ceiling of the scope kind',
  })
  permissions: string[];
}

export function toWorkspaceMeDto(
  workspace: WorkspaceContext,
  scope: TenantScope,
  permissions: string[],
): WorkspaceMeResponseDto {
  return {
    workspaceId: workspace.id,
    role: { id: workspace.role.id, name: workspace.role.name, isSystem: workspace.role.isSystem },
    scope: {
      kind: scopeKindOf(scope),
      clientId: scope.clientId,
      advertiserId: scope.advertiserId,
    },
    permissions: [...permissions].sort(),
  };
}
