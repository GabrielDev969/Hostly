import { PERMISSIONS } from '@modules/rbac/constants/permissions';
import {
  Controller,
  Get,
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
  ApiHeader,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { CurrentWorkspace } from '@shared/decorators/current-workspace.decorator';
import { RequirePermissions } from '@shared/decorators/require-permissions.decorator';
import { Audit } from '@shared/decorators/audit.decorator';
import { Idempotent } from '@shared/idempotency/idempotent.decorator';
import { RateLimit } from '@shared/decorators/rate-limits';
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
import { ErrorResponseDto } from '@shared/dto/error-response.dto';
import type { AuthenticatedUser } from '@shared/types/authenticated-user.type';
import type { WorkspaceContext } from '@shared/types/workspace-context.type';
import { SendInvitationDto } from './dto/send-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { InvitationResponseDto } from './dto/invitation-response.dto';
import { SendInvitationUseCase } from '../use-cases/send-invitation.use-case';
import { ListInvitationsUseCase } from '../use-cases/list-invitations.use-case';
import { AcceptInvitationUseCase } from '../use-cases/accept-invitation.use-case';
import { RevokeInvitationUseCase } from '../use-cases/revoke-invitation.use-case';

@ApiTags('Invitations')
@ApiBearerAuth()
@Controller({ path: 'invitations', version: '1' })
export class InvitationsController {
  constructor(
    private readonly sendInvitation: SendInvitationUseCase,
    private readonly listInvitations: ListInvitationsUseCase,
    private readonly acceptInvitation: AcceptInvitationUseCase,
    private readonly revokeInvitation: RevokeInvitationUseCase,
  ) {}

  @Get()
  @UseGuards(WorkspaceGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.WORKSPACE.INVITE)
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiOperation({ summary: 'List invitations for the current workspace' })
  @ApiResponse({ status: 200, type: [InvitationResponseDto] })
  @ApiAuthErrors()
  @ApiServerError()
  async list(@CurrentWorkspace() workspace: WorkspaceContext): Promise<InvitationResponseDto[]> {
    return this.listInvitations.execute(workspace.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(WorkspaceGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.WORKSPACE.INVITE)
  @Idempotent()
  @Audit({ action: 'invitation.sent', resource: 'Invitation' })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiOperation({ summary: 'Send an invitation to join the workspace' })
  @ApiBody({ type: SendInvitationDto })
  @ApiResponse({
    status: 201,
    type: InvitationResponseDto,
    description: 'Includes the acceptance token (use it to send the email)',
  })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiNotFoundError('Client')
  @ApiConflictError('Already a member or pending invite')
  @ApiServerError()
  async send(
    @Body() dto: SendInvitationDto,
    @CurrentWorkspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InvitationResponseDto> {
    return this.sendInvitation.execute({
      workspaceId: workspace.id,
      email: dto.email,
      roleId: dto.roleId,
      clientId: dto.clientId ?? null,
      invitedById: user.id,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(WorkspaceGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.WORKSPACE.INVITE)
  @Audit({ action: 'invitation.revoked', resource: 'Invitation' })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Invitation revoked' })
  @ApiResponse({
    status: 400,
    description: 'Already accepted; cannot revoke',
    type: ErrorResponseDto,
  })
  @ApiAuthErrors()
  @ApiNotFoundError('Invitation')
  @ApiServerError()
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ): Promise<void> {
    await this.revokeInvitation.execute({
      invitationId: id,
      workspaceId: workspace.id,
    });
  }

  @Post('accept')
  @RateLimit('invitationAccept')
  @HttpCode(HttpStatus.OK)
  @Idempotent()
  @Audit({ action: 'invitation.accepted', resource: 'Invitation' })
  @ApiOperation({
    summary: 'Accept an invitation; user must be authenticated with the invited email',
  })
  @ApiBody({ type: AcceptInvitationDto })
  @ApiResponse({ status: 200, description: 'Membership created' })
  @ApiResponse({
    status: 400,
    description: 'Expired or already accepted',
    type: ErrorResponseDto,
  })
  @ApiValidationError()
  @ApiResponse({
    status: 403,
    description: 'Logged-in email does not match the invitation',
    type: ErrorResponseDto,
  })
  @ApiNotFoundError('Invitation')
  @ApiRateLimitError()
  @ApiServerError()
  async accept(
    @Body() dto: AcceptInvitationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ workspaceId: string; roleId: string }> {
    return this.acceptInvitation.execute({
      token: dto.token,
      userId: user.id,
    });
  }
}
