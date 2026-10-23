import { PERMISSIONS } from '@modules/rbac/constants/permissions';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { Audit } from '@shared/decorators/audit.decorator';
import { RequirePermissions } from '@shared/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@shared/guards/permissions.guard';
import { WorkspaceGuard } from '@shared/guards/workspace.guard';
import {
  ApiAuthErrors,
  ApiNotFoundError,
  ApiServerError,
  ApiValidationError,
} from '@shared/swagger/api-errors.decorator';
import { RobotResponseDto } from './dto/robot-response.dto';
import { ListRobotsQueryDto } from './dto/list-robots-query.dto';
import { RenameRobotDto } from './dto/rename-robot.dto';
import { MoveRobotDto } from './dto/move-robot.dto';
import { RobotTelemetryQueryDto } from './dto/robot-telemetry-query.dto';
import { RobotTelemetryHistoryDto } from './dto/robot-telemetry-history.dto';
import { ListRobotsUseCase } from '../use-cases/list-robots.use-case';
import { GetRobotUseCase } from '../use-cases/get-robot.use-case';
import { RenameRobotUseCase } from '../use-cases/rename-robot.use-case';
import { MoveRobotUseCase } from '../use-cases/move-robot.use-case';
import { RevokeRobotUseCase } from '../use-cases/revoke-robot.use-case';
import { GetRobotTelemetryUseCase } from '../use-cases/get-robot-telemetry.use-case';

@ApiTags('Robots')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-workspace-id',
  description: 'ID of the workspace context',
  required: true,
})
@Controller({ path: 'robots', version: '1' })
@UseGuards(WorkspaceGuard, PermissionsGuard)
export class RobotsController {
  constructor(
    private readonly listRobots: ListRobotsUseCase,
    private readonly getRobot: GetRobotUseCase,
    private readonly renameRobot: RenameRobotUseCase,
    private readonly moveRobot: MoveRobotUseCase,
    private readonly revokeRobot: RevokeRobotUseCase,
    private readonly getTelemetry: GetRobotTelemetryUseCase,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ROBOT.READ)
  @ApiOperation({ summary: 'List robots in scope (a client user sees only their own)' })
  @ApiResponse({ status: 200, type: [RobotResponseDto] })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiServerError()
  async list(@Query() query: ListRobotsQueryDto): Promise<RobotResponseDto[]> {
    return this.listRobots.execute({
      clientId: query.clientId,
      siteId: query.siteId,
      status: query.status,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ROBOT.READ)
  @ApiOperation({ summary: 'Get a robot by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: RobotResponseDto })
  @ApiAuthErrors()
  @ApiNotFoundError('Robot')
  @ApiServerError()
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<RobotResponseDto> {
    return this.getRobot.execute(id);
  }

  @Get(':id/telemetry')
  @RequirePermissions(PERMISSIONS.ROBOT.READ)
  @ApiOperation({
    summary:
      'Battery and mode history in 5-minute buckets; a client user sees only the time the robot was theirs',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: RobotTelemetryHistoryDto })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiNotFoundError('Robot')
  @ApiServerError()
  async telemetry(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: RobotTelemetryQueryDto,
  ): Promise<RobotTelemetryHistoryDto> {
    return this.getTelemetry.execute({ id, hours: query.hours });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ROBOT.UPDATE)
  @Audit({ action: 'robot.renamed', resource: 'Robot' })
  @ApiOperation({ summary: 'Rename a robot' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({ type: RenameRobotDto })
  @ApiResponse({ status: 200, type: RobotResponseDto })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiNotFoundError('Robot')
  @ApiServerError()
  async rename(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameRobotDto,
  ): Promise<RobotResponseDto> {
    return this.renameRobot.execute({ id, name: dto.name });
  }

  @Post(':id/move')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.ROBOT.MOVE)
  @Audit({ action: 'robot.moved', resource: 'Robot' })
  @ApiOperation({
    summary: 'Move a robot to another site, of any client; its token keeps working',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({ type: MoveRobotDto })
  @ApiResponse({ status: 200, type: RobotResponseDto })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiNotFoundError('Robot or site')
  @ApiServerError()
  async move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveRobotDto,
  ): Promise<RobotResponseDto> {
    return this.moveRobot.execute({ id, siteId: dto.siteId });
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.ROBOT.REVOKE)
  @Audit({ action: 'robot.revoked', resource: 'Robot' })
  @ApiOperation({ summary: 'Revoke the device token; the robot must be paired again' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: RobotResponseDto })
  @ApiAuthErrors()
  @ApiNotFoundError('Robot')
  @ApiServerError()
  async revoke(@Param('id', ParseUUIDPipe) id: string): Promise<RobotResponseDto> {
    return this.revokeRobot.execute(id);
  }
}
