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
} from '@nestjs/swagger';
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
import { ClientResponseDto } from './dto/client-response.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ListClientsQueryDto } from './dto/list-clients-query.dto';
import { ListClientsUseCase } from '../use-cases/list-clients.use-case';
import { GetClientUseCase } from '../use-cases/get-client.use-case';
import { CreateClientUseCase } from '../use-cases/create-client.use-case';
import { UpdateClientUseCase } from '../use-cases/update-client.use-case';
import { DeleteClientUseCase } from '../use-cases/delete-client.use-case';

@ApiTags('Clients')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-workspace-id',
  description: 'ID of the workspace context',
  required: true,
})
@Controller({ path: 'clients', version: '1' })
@UseGuards(WorkspaceGuard, PermissionsGuard)
export class ClientsController {
  constructor(
    private readonly listClients: ListClientsUseCase,
    private readonly getClient: GetClientUseCase,
    private readonly createClient: CreateClientUseCase,
    private readonly updateClient: UpdateClientUseCase,
    private readonly deleteClient: DeleteClientUseCase,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CLIENT.READ)
  @ApiOperation({ summary: 'List clients in scope (a client user sees only their own)' })
  @ApiResponse({ status: 200, type: [ClientResponseDto] })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiServerError()
  async list(@Query() query: ListClientsQueryDto): Promise<ClientResponseDto[]> {
    return this.listClients.execute({ status: query.status });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CLIENT.READ)
  @ApiOperation({ summary: 'Get a client by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: ClientResponseDto })
  @ApiAuthErrors()
  @ApiNotFoundError('Client')
  @ApiServerError()
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ClientResponseDto> {
    return this.getClient.execute(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.CLIENT.CREATE)
  @Idempotent()
  @Audit({ action: 'client.created', resource: 'Client' })
  @ApiOperation({ summary: 'Create a client' })
  @ApiBody({ type: CreateClientDto })
  @ApiResponse({ status: 201, type: ClientResponseDto })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiServerError()
  async create(@Body() dto: CreateClientDto): Promise<ClientResponseDto> {
    return this.createClient.execute(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CLIENT.UPDATE)
  @Audit({ action: 'client.updated', resource: 'Client' })
  @ApiOperation({ summary: 'Update a client (the internal client stays active)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({ type: UpdateClientDto })
  @ApiResponse({ status: 200, type: ClientResponseDto })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiNotFoundError('Client')
  @ApiServerError()
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
  ): Promise<ClientResponseDto> {
    return this.updateClient.execute({ id, ...dto });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.CLIENT.DELETE)
  @Audit({ action: 'client.deleted', resource: 'Client', resourceIdFrom: 'param' })
  @ApiOperation({ summary: 'Delete a client (soft delete)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Client deleted' })
  @ApiAuthErrors()
  @ApiNotFoundError('Client')
  @ApiConflictError('Internal client, or it still has members, pending invitations or sites')
  @ApiServerError()
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.deleteClient.execute(id);
  }
}
