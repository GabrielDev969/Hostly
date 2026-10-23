import { PERMISSIONS } from '@modules/rbac/constants/permissions';
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Audit } from '@shared/decorators/audit.decorator';
import { CurrentPermissions } from '@shared/decorators/current-permissions.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequirePermissions } from '@shared/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@shared/guards/permissions.guard';
import { WorkspaceGuard } from '@shared/guards/workspace.guard';
import {
  ApiAuthErrors,
  ApiConflictError,
  ApiNotFoundError,
  ApiRateLimitError,
  ApiServerError,
  ApiValidationError,
} from '@shared/swagger/api-errors.decorator';
import type { AuthenticatedUser } from '@shared/types/authenticated-user.type';
import { LookupPairingDto } from './dto/lookup-pairing.dto';
import { ApprovePairingDto } from './dto/approve-pairing.dto';
import { PairingLookupResponseDto } from './dto/pairing-lookup-response.dto';
import { RobotResponseDto } from './dto/robot-response.dto';
import { LookupPairingUseCase } from '../use-cases/lookup-pairing.use-case';
import { ApprovePairingUseCase } from '../use-cases/approve-pairing.use-case';

// The code travels in the body, never in the URL, which the request log records.
@ApiTags('Robots')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-workspace-id',
  description: 'ID of the workspace context',
  required: true,
})
@Controller({ path: 'robots/pairings', version: '1' })
@UseGuards(WorkspaceGuard, PermissionsGuard)
export class RobotPairingsController {
  constructor(
    private readonly lookupPairing: LookupPairingUseCase,
    private readonly approvePairing: ApprovePairingUseCase,
  ) {}

  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.ROBOT.PAIR)
  @ApiOperation({
    summary: 'Show the serial behind a pairing code before approving it (counts as an attempt)',
  })
  @ApiBody({ type: LookupPairingDto })
  @ApiResponse({ status: 200, type: PairingLookupResponseDto })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiNotFoundError('Pairing code')
  @ApiRateLimitError()
  @ApiServerError()
  async lookup(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LookupPairingDto,
  ): Promise<PairingLookupResponseDto> {
    return this.lookupPairing.execute({ userId: user.id, code: dto.code });
  }

  @Post('approve')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.ROBOT.PAIR)
  @Audit({ action: 'robot.paired', resource: 'Robot' })
  @ApiOperation({
    summary: 'Approve a pairing code into a site: creates the robot or updates it (same serial)',
    description:
      'Pairing an existing robot again also requires robot:revoke if it is active, robot:move if the site changes and robot:update if the name changes.',
  })
  @ApiBody({ type: ApprovePairingDto })
  @ApiResponse({ status: 201, type: RobotResponseDto })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiNotFoundError('Pairing code or site')
  @ApiConflictError('Serial registered to another organization, or pairing already approved')
  @ApiRateLimitError()
  @ApiServerError()
  async approve(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentPermissions() permissions: string[],
    @Body() dto: ApprovePairingDto,
  ): Promise<RobotResponseDto> {
    return this.approvePairing.execute({
      userId: user.id,
      code: dto.code,
      siteId: dto.siteId,
      name: dto.name,
      permissions,
    });
  }
}
