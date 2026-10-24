import { PERMISSIONS } from '@modules/rbac/constants/permissions';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentWorkspace } from '@shared/decorators/current-workspace.decorator';
import { RequirePermissions } from '@shared/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@shared/guards/permissions.guard';
import { WorkspaceGuard } from '@shared/guards/workspace.guard';
import { ApiAuthErrors, ApiServerError } from '@shared/swagger/api-errors.decorator';
import type { WorkspaceContext } from '@shared/types/workspace-context.type';
import { FeatureFlagsService } from '../services/feature-flags.service';
import { FeatureFlagResponseDto } from './dto/feature-flag-response.dto';

@ApiTags('Workspaces')
@ApiBearerAuth()
@Controller({ path: 'workspaces/:workspaceId/features', version: '1' })
@UseGuards(WorkspaceGuard, PermissionsGuard)
export class WorkspaceFeatureFlagsController {
  constructor(private readonly features: FeatureFlagsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.WORKSPACE.READ)
  @ApiOperation({
    summary: 'List effective feature flags for the current workspace',
  })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: [FeatureFlagResponseDto] })
  @ApiAuthErrors()
  @ApiServerError()
  async list(@CurrentWorkspace() workspace: WorkspaceContext): Promise<FeatureFlagResponseDto[]> {
    return this.features.getEffective(workspace.id);
  }
}
