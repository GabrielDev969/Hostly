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
import { SiteResponseDto } from './dto/site-response.dto';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { ListSitesQueryDto } from './dto/list-sites-query.dto';
import { ListSitesUseCase } from '../use-cases/list-sites.use-case';
import { GetSiteUseCase } from '../use-cases/get-site.use-case';
import { CreateSiteUseCase } from '../use-cases/create-site.use-case';
import { UpdateSiteUseCase } from '../use-cases/update-site.use-case';
import { DeleteSiteUseCase } from '../use-cases/delete-site.use-case';

@ApiTags('Sites')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-workspace-id',
  description: 'ID of the workspace context',
  required: true,
})
@Controller({ path: 'sites', version: '1' })
@UseGuards(WorkspaceGuard, PermissionsGuard)
export class SitesController {
  constructor(
    private readonly listSites: ListSitesUseCase,
    private readonly getSite: GetSiteUseCase,
    private readonly createSite: CreateSiteUseCase,
    private readonly updateSite: UpdateSiteUseCase,
    private readonly deleteSite: DeleteSiteUseCase,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SITE.READ)
  @ApiOperation({ summary: 'List sites in scope (a client user sees only their own)' })
  @ApiResponse({ status: 200, type: [SiteResponseDto] })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiServerError()
  async list(@Query() query: ListSitesQueryDto): Promise<SiteResponseDto[]> {
    return this.listSites.execute({ clientId: query.clientId });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SITE.READ)
  @ApiOperation({ summary: 'Get a site by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: SiteResponseDto })
  @ApiAuthErrors()
  @ApiNotFoundError('Site')
  @ApiServerError()
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<SiteResponseDto> {
    return this.getSite.execute(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.SITE.CREATE)
  @Idempotent()
  @Audit({ action: 'site.created', resource: 'Site' })
  @ApiOperation({ summary: 'Create a site for a client' })
  @ApiBody({ type: CreateSiteDto })
  @ApiResponse({ status: 201, type: SiteResponseDto })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiNotFoundError('Client')
  @ApiServerError()
  async create(@Body() dto: CreateSiteDto): Promise<SiteResponseDto> {
    return this.createSite.execute(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SITE.UPDATE)
  @Audit({ action: 'site.updated', resource: 'Site' })
  @ApiOperation({ summary: 'Update a site (its client never changes)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({ type: UpdateSiteDto })
  @ApiResponse({ status: 200, type: SiteResponseDto })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiNotFoundError('Site')
  @ApiServerError()
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSiteDto,
  ): Promise<SiteResponseDto> {
    return this.updateSite.execute({ id, ...dto });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.SITE.DELETE)
  @Audit({ action: 'site.deleted', resource: 'Site', resourceIdFrom: 'param' })
  @ApiOperation({ summary: 'Delete a site (soft delete)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Site deleted' })
  @ApiAuthErrors()
  @ApiNotFoundError('Site')
  @ApiConflictError('The site still has robots')
  @ApiServerError()
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.deleteSite.execute(id);
  }
}
