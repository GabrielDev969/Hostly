import { PERMISSIONS } from '@modules/rbac/constants/permissions';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
  ApiQuery,
} from '@nestjs/swagger';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { CurrentWorkspace } from '@shared/decorators/current-workspace.decorator';
import { RequirePermissions } from '@shared/decorators/require-permissions.decorator';
import { PaginatedResponseDto } from '@shared/dto/paginated-response.dto';
import { PermissionsGuard } from '@shared/guards/permissions.guard';
import { WorkspaceGuard } from '@shared/guards/workspace.guard';
import {
  ApiAuthErrors,
  ApiConflictError,
  ApiNotFoundError,
  ApiServerError,
  ApiValidationError,
} from '@shared/swagger/api-errors.decorator';
import type { AuthenticatedUser } from '@shared/types/authenticated-user.type';
import type { WorkspaceContext } from '@shared/types/workspace-context.type';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { ListUsersUseCase } from '../use-cases/list-users.use-case';
import { GetUserByIdUseCase } from '../use-cases/get-user-by-id.use-case';
import { CreateUserUseCase } from '../use-cases/create-user.use-case';
import { UpdateUserUseCase } from '../use-cases/update-user.use-case';
import { DeleteUserUseCase } from '../use-cases/delete-user.use-case';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { Audit } from '@shared/decorators/audit.decorator';
import { Idempotent } from '@shared/idempotency/idempotent.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-workspace-id',
  description: 'ID of the workspace context',
  required: true,
})
@Controller({ path: 'users', version: '1' })
@UseGuards(WorkspaceGuard, PermissionsGuard)
export class UsersController {
  constructor(
    private readonly listUsers: ListUsersUseCase,
    private readonly getUserById: GetUserByIdUseCase,
    private readonly createUser: CreateUserUseCase,
    private readonly updateUser: UpdateUserUseCase,
    private readonly deleteUser: DeleteUserUseCase,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USER.READ)
  @ApiOperation({ summary: 'List users in the workspace' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Filter by name or email (substring, case-insensitive)',
  })
  @ApiResponse({ status: 200, type: PaginatedResponseDto<UserResponseDto> })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiServerError()
  async list(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Query() query: ListUsersQueryDto,
  ): Promise<PaginatedResponseDto<UserResponseDto>> {
    return this.listUsers.execute({
      workspaceId: workspace.id,
      page: query.page,
      limit: query.limit,
      search: query.search,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.USER.READ)
  @ApiOperation({ summary: 'Get a user by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiAuthErrors()
  @ApiNotFoundError('User')
  @ApiServerError()
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ): Promise<UserResponseDto> {
    return this.getUserById.execute({ id, workspaceId: workspace.id });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.USER.CREATE)
  @Idempotent()
  @Audit({ action: 'user.created', resource: 'User' })
  @ApiOperation({ summary: 'Create a user in the workspace' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, type: UserResponseDto })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiConflictError('Email already in use')
  @ApiServerError()
  async create(
    @Body() dto: CreateUserDto,
    @CurrentWorkspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    return this.createUser.execute({
      ...dto,
      workspaceId: workspace.id,
      createdBy: user.id,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USER.UPDATE)
  @Audit({ action: 'user.updated', resource: 'User' })
  @ApiOperation({ summary: 'Update a user' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiNotFoundError('User')
  @ApiServerError()
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ): Promise<UserResponseDto> {
    return this.updateUser.execute({
      id,
      workspaceId: workspace.id,
      ...dto,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.USER.DELETE)
  @Audit({ action: 'user.deleted', resource: 'User' })
  @ApiOperation({ summary: 'Delete a user (soft delete)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'User deleted successfully' })
  @ApiAuthErrors()
  @ApiNotFoundError('User')
  @ApiServerError()
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ): Promise<void> {
    return this.deleteUser.execute({ id, workspaceId: workspace.id });
  }
}
