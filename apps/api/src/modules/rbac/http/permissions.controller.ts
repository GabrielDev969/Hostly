import { PERMISSIONS } from '@modules/rbac/constants/permissions';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentWorkspace } from '@shared/decorators/current-workspace.decorator';
import { RequirePermissions } from '@shared/decorators/require-permissions.decorator';
import { Audit } from '@shared/decorators/audit.decorator';
import { Idempotent } from '@shared/idempotency/idempotent.decorator';
import { PermissionsGuard } from '@shared/guards/permissions.guard';
import { WorkspaceGuard } from '@shared/guards/workspace.guard';
import {
  ApiAuthErrors,
  ApiConflictError,
  ApiNotFoundError,
  ApiServerError,
  ApiValidationError,
} from '@shared/swagger/api-errors.decorator';
import type { WorkspaceContext } from '@shared/types/workspace-context.type';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { PermissionResponseDto, toPermissionDto } from './dto/permission-response.dto';
import { CreatePermissionUseCase } from '../use-cases/create-permission.use-case';
import { DeletePermissionUseCase } from '../use-cases/delete-permission.use-case';
import { ListWorkspacePermissionsUseCase } from '../use-cases/list-workspace-permissions.use-case';

@ApiTags('RBAC')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-workspace-id',
  description: 'ID of the workspace context',
  required: true,
})
@Controller({ path: 'rbac/permissions', version: '1' })
@UseGuards(WorkspaceGuard, PermissionsGuard)
export class PermissionsController {
  constructor(
    private readonly listPermissions: ListWorkspacePermissionsUseCase,
    private readonly createPermission: CreatePermissionUseCase,
    private readonly deletePermission: DeletePermissionUseCase,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ROLE.READ)
  @ApiOperation({
    summary: 'List permissions visible to this workspace (global + custom)',
  })
  @ApiResponse({ status: 200, type: [PermissionResponseDto] })
  @ApiAuthErrors()
  @ApiServerError()
  async list(@CurrentWorkspace() workspace: WorkspaceContext): Promise<PermissionResponseDto[]> {
    const perms = await this.listPermissions.execute(workspace.id);
    return perms.map(toPermissionDto);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.ROLE.UPDATE)
  @Idempotent()
  @Audit({ action: 'permission.created', resource: 'Permission' })
  @ApiOperation({ summary: 'Create a custom permission in this workspace' })
  @ApiBody({ type: CreatePermissionDto })
  @ApiResponse({ status: 201, type: PermissionResponseDto })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiConflictError('Key collides with a built-in permission or already exists')
  @ApiServerError()
  async create(
    @Body() dto: CreatePermissionDto,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ): Promise<PermissionResponseDto> {
    const created = await this.createPermission.execute({
      workspaceId: workspace.id,
      key: dto.key,
      description: dto.description,
      category: dto.category,
    });
    return toPermissionDto(created);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.ROLE.UPDATE)
  @Audit({ action: 'permission.deleted', resource: 'Permission' })
  @ApiOperation({
    summary: 'Delete a custom permission (cascade-removes it from any roles using it)',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Permission deleted' })
  @ApiAuthErrors()
  @ApiNotFoundError('Permission')
  @ApiServerError()
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ): Promise<void> {
    await this.deletePermission.execute({ id, workspaceId: workspace.id });
  }
}
