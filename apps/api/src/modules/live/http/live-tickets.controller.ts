import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AccessTokenPayload } from '@modules/auth/services/token.service';
import { PERMISSIONS } from '@modules/rbac/constants/permissions';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequirePermissions } from '@shared/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@shared/guards/permissions.guard';
import { WorkspaceGuard } from '@shared/guards/workspace.guard';
import { ApiAuthErrors, ApiServerError } from '@shared/swagger/api-errors.decorator';
import { LiveTicketResponseDto } from './dto/live-ticket-response.dto';
import { IssueLiveTicketUseCase } from '../use-cases/issue-live-ticket.use-case';

// The browser cannot send the access token on a WebSocket, so it trades it here for a short single-use ticket.
@ApiTags('Live')
@ApiBearerAuth()
@ApiHeader({
  name: 'x-workspace-id',
  description: 'ID of the workspace context',
  required: true,
})
@Controller({ path: 'live/tickets', version: '1' })
@UseGuards(WorkspaceGuard, PermissionsGuard)
export class LiveTicketsController {
  constructor(private readonly issueTicket: IssueLiveTicketUseCase) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.ROBOT.READ)
  @ApiOperation({
    summary: 'Issue a single-use ticket for the live socket (robot status of the robots in scope)',
  })
  @ApiResponse({ status: 201, type: LiveTicketResponseDto })
  @ApiResponse({ status: 503, description: 'Ticket store unavailable' })
  @ApiAuthErrors()
  @ApiServerError()
  async issue(@CurrentUser() user: AccessTokenPayload): Promise<LiveTicketResponseDto> {
    return this.issueTicket.execute(user.id);
  }
}
