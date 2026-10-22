import { Controller, Get, Delete, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ListSessionsUseCase } from '../use-cases/list-sessions.use-case';
import { RevokeSessionUseCase } from '../use-cases/revoke-session.use-case';
import { RevokeAllSessionsUseCase } from '../use-cases/revoke-all-sessions.use-case';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { Audit } from '@shared/decorators/audit.decorator';
import {
  ApiAuthErrors,
  ApiNotFoundError,
  ApiServerError,
} from '@shared/swagger/api-errors.decorator';
import type { AccessTokenPayload } from '@modules/auth/services/token.service';

@ApiTags('Sessions')
@ApiBearerAuth()
@Controller('auth/sessions')
export class SessionsController {
  constructor(
    private listSessions: ListSessionsUseCase,
    private revokeSession: RevokeSessionUseCase,
    private revokeAllSessions: RevokeAllSessionsUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List active sessions for the current user' })
  @ApiResponse({ status: 200, description: 'Active sessions' })
  @ApiAuthErrors()
  @ApiServerError()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.listSessions.execute(user.id, user.sessionId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({
    action: 'auth.session.revoked',
    resource: 'Session',
    resourceIdFrom: 'param',
  })
  @ApiOperation({ summary: 'Revoke a specific session' })
  @ApiParam({ name: 'id', description: 'Session id' })
  @ApiResponse({ status: 204, description: 'Session revoked' })
  @ApiAuthErrors()
  @ApiNotFoundError('Session')
  @ApiServerError()
  revoke(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.revokeSession.execute(id, user.id);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'auth.session.revoked_all' })
  @ApiOperation({ summary: 'Revoke all sessions except the current one' })
  @ApiResponse({ status: 204, description: 'Other sessions revoked' })
  @ApiAuthErrors()
  @ApiServerError()
  revokeAll(@CurrentUser() user: AccessTokenPayload) {
    return this.revokeAllSessions.execute(user.id, user.sessionId);
  }
}
