import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Audit } from '@shared/decorators/audit.decorator';
import { Idempotent } from '@shared/idempotency/idempotent.decorator';
import { SuperAdminGuard } from '@shared/guards/super-admin.guard';
import {
  ApiAuthErrors,
  ApiNotFoundError,
  ApiServerError,
  ApiValidationError,
} from '@shared/swagger/api-errors.decorator';
import { FeatureFlagsService } from '../services/feature-flags.service';
import { FeatureFlagResponseDto } from './dto/feature-flag-response.dto';
import { SetFeatureFlagDto } from './dto/set-feature-flag.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller({ path: 'admin/workspaces/:workspaceId/features', version: '1' })
@UseGuards(SuperAdminGuard)
export class AdminFeatureFlagsController {
  constructor(private readonly features: FeatureFlagsService) {}

  @Get()
  @ApiOperation({
    summary: 'List effective feature flags for a workspace (super admin only)',
  })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: [FeatureFlagResponseDto] })
  @ApiAuthErrors()
  @ApiServerError()
  async list(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<FeatureFlagResponseDto[]> {
    return this.features.getEffective(workspaceId);
  }

  @Put(':key')
  @Idempotent()
  @Audit({ action: 'admin.feature_flag.set', resource: 'WorkspaceFeatureFlag' })
  @ApiOperation({
    summary: 'Override a feature flag for a workspace (super admin only)',
  })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'key', type: 'string', description: 'Feature key' })
  @ApiBody({ type: SetFeatureFlagDto })
  @ApiResponse({ status: 200, description: 'Override applied' })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiNotFoundError('Feature key')
  @ApiServerError()
  async set(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('key') key: string,
    @Body() dto: SetFeatureFlagDto,
  ): Promise<{ workspaceId: string; key: string; enabled: boolean }> {
    const row = await this.features.setOverride(workspaceId, key, dto.enabled);
    return {
      workspaceId: row.workspaceId,
      key: row.key,
      enabled: row.enabled,
    };
  }

  @Delete(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({
    action: 'admin.feature_flag.clear',
    resource: 'WorkspaceFeatureFlag',
  })
  @ApiOperation({
    summary: 'Remove the workspace override for a feature flag, reverting to registry default',
  })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'key', type: 'string' })
  @ApiResponse({ status: 204, description: 'Override removed' })
  @ApiAuthErrors()
  @ApiNotFoundError('Feature key')
  @ApiServerError()
  async clear(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('key') key: string,
  ): Promise<void> {
    await this.features.clearOverride(workspaceId, key);
  }
}
