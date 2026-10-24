import { PERMISSIONS } from '@modules/rbac/constants/permissions';
import {
  Controller,
  Get,
  Patch,
  Post,
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
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { CurrentWorkspace } from '@shared/decorators/current-workspace.decorator';
import { CurrentPermissions } from '@shared/decorators/current-permissions.decorator';
import { CurrentScope } from '@shared/decorators/current-scope.decorator';
import { RequirePermissions } from '@shared/decorators/require-permissions.decorator';
import { Audit } from '@shared/decorators/audit.decorator';
import { Idempotent } from '@shared/idempotency/idempotent.decorator';
import { PermissionsGuard } from '@shared/guards/permissions.guard';
import { WorkspaceGuard } from '@shared/guards/workspace.guard';
import {
  ApiAuthErrors,
  ApiNotFoundError,
  ApiServerError,
  ApiValidationError,
} from '@shared/swagger/api-errors.decorator';
import type { AuthenticatedUser } from '@shared/types/authenticated-user.type';
import type { WorkspaceContext } from '@shared/types/workspace-context.type';
import type { TenantScope } from '@shared/tenancy/tenant-scope';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceResponseDto } from './dto/workspace-response.dto';
import { WorkspaceMeResponseDto, toWorkspaceMeDto } from './dto/workspace-me-response.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import { WorkspaceMemberResponseDto, toMemberDto } from './dto/member-response.dto';
import { GetWorkspaceUseCase } from '../use-cases/get-workspace.use-case';
import { ListWorkspacesUseCase } from '../use-cases/list-workspaces.use-case';
import { UpdateWorkspaceUseCase } from '../use-cases/update-workspace.use-case';
import { DeleteWorkspaceUseCase } from '../use-cases/delete-workspace.use-case';
import { ListMembersUseCase } from '../use-cases/list-members.use-case';
import { UpdateMemberRoleUseCase } from '../use-cases/update-member-role.use-case';
import { RemoveMemberUseCase } from '../use-cases/remove-member.use-case';
import { TransferOwnershipUseCase } from '../use-cases/transfer-ownership.use-case';

@ApiTags('Workspaces')
@ApiBearerAuth()
@Controller({ path: 'workspaces', version: '1' })
export class WorkspacesController {
  constructor(
    private readonly getWorkspace: GetWorkspaceUseCase,
    private readonly listWorkspaces: ListWorkspacesUseCase,
    private readonly updateWorkspace: UpdateWorkspaceUseCase,
    private readonly deleteWorkspace: DeleteWorkspaceUseCase,
    private readonly listMembers: ListMembersUseCase,
    private readonly updateMemberRole: UpdateMemberRoleUseCase,
    private readonly removeMember: RemoveMemberUseCase,
    private readonly transferOwnership: TransferOwnershipUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List workspaces the current user belongs to' })
  @ApiResponse({ status: 200, type: [WorkspaceResponseDto] })
  @ApiAuthErrors()
  @ApiServerError()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<WorkspaceResponseDto[]> {
    return this.listWorkspaces.execute(user.id);
  }

  // Second layer: the WorkspaceGuard already turns a static segment such as `features` into a 400.
  @Get(':workspaceId')
  @UseGuards(WorkspaceGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.WORKSPACE.READ)
  @ApiOperation({ summary: 'Get a workspace by ID' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: WorkspaceResponseDto })
  @ApiAuthErrors()
  @ApiNotFoundError('Workspace')
  @ApiServerError()
  async findOne(
    @Param('workspaceId', ParseUUIDPipe) _workspaceId: string,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ): Promise<WorkspaceResponseDto> {
    return this.getWorkspace.execute(workspace.id);
  }

  // No permission required: it describes the caller's own membership, which the panel needs to render.
  @Get(':workspaceId/me')
  @UseGuards(WorkspaceGuard)
  @ApiOperation({
    summary: "Caller's membership in the workspace: role, scope and effective permissions",
  })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: WorkspaceMeResponseDto })
  @ApiAuthErrors()
  @ApiNotFoundError('Workspace')
  @ApiServerError()
  me(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @CurrentScope() scope: TenantScope,
    @CurrentPermissions() permissions: string[],
  ): WorkspaceMeResponseDto {
    return toWorkspaceMeDto(workspace, scope, permissions);
  }

  @Patch(':workspaceId')
  @UseGuards(WorkspaceGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.WORKSPACE.UPDATE)
  @Audit({ action: 'workspace.updated', resource: 'Workspace' })
  @ApiOperation({ summary: 'Update a workspace' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiBody({ type: UpdateWorkspaceDto })
  @ApiResponse({ status: 200, type: WorkspaceResponseDto })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiNotFoundError('Workspace')
  @ApiServerError()
  async update(
    @Body() dto: UpdateWorkspaceDto,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ): Promise<WorkspaceResponseDto> {
    return this.updateWorkspace.execute({ id: workspace.id, name: dto.name });
  }

  @Delete(':workspaceId')
  @UseGuards(WorkspaceGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.WORKSPACE.DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'workspace.deleted', resource: 'Workspace' })
  @ApiOperation({ summary: 'Soft delete a workspace' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Workspace deleted' })
  @ApiAuthErrors()
  @ApiNotFoundError('Workspace')
  @ApiServerError()
  async remove(@CurrentWorkspace() workspace: WorkspaceContext): Promise<void> {
    await this.deleteWorkspace.execute(workspace.id);
  }

  @Get(':workspaceId/members')
  @UseGuards(WorkspaceGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.WORKSPACE.READ)
  @ApiOperation({ summary: 'List members of the workspace with their roles' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: [WorkspaceMemberResponseDto] })
  @ApiAuthErrors()
  @ApiServerError()
  async listMembersEndpoint(
    @CurrentWorkspace() workspace: WorkspaceContext,
  ): Promise<WorkspaceMemberResponseDto[]> {
    const members = await this.listMembers.execute(workspace.id);
    return members.map((m) => toMemberDto(m));
  }

  @Patch(':workspaceId/members/:memberId')
  @UseGuards(WorkspaceGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ROLE.ASSIGN)
  @Audit({ action: 'member.role_updated', resource: 'WorkspaceMember' })
  @ApiOperation({ summary: "Update a member's role within the workspace" })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'memberId', type: 'string', format: 'uuid' })
  @ApiBody({ type: UpdateMemberRoleDto })
  @ApiResponse({ status: 200, description: 'Role updated' })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiNotFoundError('Member')
  @ApiServerError()
  async updateMemberRoleEndpoint(
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ): Promise<void> {
    await this.updateMemberRole.execute({
      workspaceId: workspace.id,
      memberId,
      roleId: dto.roleId,
    });
  }

  @Delete(':workspaceId/members/:memberId')
  @UseGuards(WorkspaceGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'member.removed', resource: 'WorkspaceMember' })
  @ApiOperation({
    summary: 'Remove a member (self-leave allowed; removing others needs workspace:remove_member)',
  })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'memberId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Member removed' })
  @ApiAuthErrors()
  @ApiNotFoundError('Member')
  @ApiServerError()
  async removeMemberEndpoint(
    @Param('memberId') memberId: string,
    @CurrentWorkspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentPermissions() permissions: string[],
  ): Promise<void> {
    await this.removeMember.execute({
      workspaceId: workspace.id,
      memberId,
      callerUserId: user.id,
      callerPermissions: permissions,
    });
  }

  @Post(':workspaceId/transfer-ownership')
  @UseGuards(WorkspaceGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.WORKSPACE.TRANSFER_OWNERSHIP)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent()
  @Audit({ action: 'workspace.ownership_transferred', resource: 'Workspace' })
  @ApiOperation({
    summary: 'Transfer ownership to another member; previous owner is demoted to Admin',
  })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiBody({ type: TransferOwnershipDto })
  @ApiResponse({ status: 204, description: 'Ownership transferred' })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiNotFoundError('Workspace or member')
  @ApiServerError()
  async transferOwnershipEndpoint(
    @Body() dto: TransferOwnershipDto,
    @CurrentWorkspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.transferOwnership.execute({
      workspaceId: workspace.id,
      callerUserId: user.id,
      targetMemberId: dto.targetMemberId,
      password: dto.password,
    });
  }
}
