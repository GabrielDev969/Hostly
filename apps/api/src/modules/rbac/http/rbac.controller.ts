import { PERMISSIONS } from '@modules/rbac/constants/permissions';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiParam,
  ApiBody,
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
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignPermissionDto } from './dto/assign-permission.dto';
import { RoleResponseDto } from './dto/role-response.dto';
import { CreateRoleUseCase } from '../use-cases/create-role.use-case';
import { ListRolesUseCase } from '../use-cases/list-roles.use-case';
import { UpdateRoleUseCase } from '../use-cases/update-role.use-case';
import { DeleteRoleUseCase } from '../use-cases/delete-role.use-case';
import { AssignPermissionToRoleUseCase } from '../use-cases/assign-permission-to-role.use-case';

@ApiTags('RBAC')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-workspace-id',
  description: 'ID of the workspace context',
  required: true,
})
@Controller({ path: 'rbac/roles', version: '1' })
@UseGuards(WorkspaceGuard, PermissionsGuard)
export class RbacController {
  constructor(
    private readonly createRole: CreateRoleUseCase,
    private readonly listRoles: ListRolesUseCase,
    private readonly updateRole: UpdateRoleUseCase,
    private readonly deleteRole: DeleteRoleUseCase,
    private readonly assignPermission: AssignPermissionToRoleUseCase,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ROLE.READ)
  @ApiOperation({ summary: 'List roles in the workspace' })
  @ApiResponse({ status: 200, type: [RoleResponseDto] })
  @ApiAuthErrors()
  @ApiServerError()
  async list(@CurrentWorkspace() workspace: WorkspaceContext): Promise<RoleResponseDto[]> {
    return this.listRoles.execute(workspace.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.ROLE.CREATE)
  @Idempotent()
  @Audit({ action: 'role.created', resource: 'Role' })
  @ApiOperation({ summary: 'Create a role in the workspace' })
  @ApiBody({ type: CreateRoleDto })
  @ApiResponse({ status: 201, type: RoleResponseDto })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiConflictError('Role name already in use')
  @ApiServerError()
  async create(
    @Body() dto: CreateRoleDto,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ): Promise<RoleResponseDto> {
    return this.createRole.execute({
      workspaceId: workspace.id,
      name: dto.name,
      description: dto.description,
      permissionKeys: dto.permissionKeys,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ROLE.UPDATE)
  @Audit({ action: 'role.updated', resource: 'Role' })
  @ApiOperation({ summary: 'Update a role' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({ type: UpdateRoleDto })
  @ApiResponse({ status: 200, type: RoleResponseDto })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiNotFoundError('Role')
  @ApiServerError()
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ): Promise<RoleResponseDto> {
    return this.updateRole.execute({
      id,
      workspaceId: workspace.id,
      ...dto,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.ROLE.DELETE)
  @Audit({ action: 'role.deleted', resource: 'Role' })
  @ApiOperation({ summary: 'Delete a role' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Role deleted' })
  @ApiAuthErrors()
  @ApiNotFoundError('Role')
  @ApiConflictError('Role is in use by members')
  @ApiServerError()
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ): Promise<void> {
    await this.deleteRole.execute({ id, workspaceId: workspace.id });
  }

  @Post(':id/permissions')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.ROLE.UPDATE)
  @Idempotent()
  @Audit({ action: 'role.permission_assigned', resource: 'Role' })
  @ApiOperation({ summary: 'Assign a permission to a role' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({ type: AssignPermissionDto })
  @ApiResponse({ status: 200, type: RoleResponseDto })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiNotFoundError('Role or permission')
  @ApiServerError()
  async addPermission(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPermissionDto,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ): Promise<RoleResponseDto> {
    return this.assignPermission.execute({
      roleId: id,
      workspaceId: workspace.id,
      permissionKey: dto.permissionKey,
    });
  }
}
