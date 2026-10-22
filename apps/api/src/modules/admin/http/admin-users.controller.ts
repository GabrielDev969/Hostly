import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Audit } from '@shared/decorators/audit.decorator';
import { SuperAdminGuard } from '@shared/guards/super-admin.guard';
import {
  ApiAuthErrors,
  ApiNotFoundError,
  ApiServerError,
} from '@shared/swagger/api-errors.decorator';
import { InvalidateUserTokensUseCase } from '../use-cases/invalidate-user-tokens.use-case';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller({ path: 'admin/users', version: '1' })
@UseGuards(SuperAdminGuard)
export class AdminUsersController {
  constructor(private readonly invalidateUserTokens: InvalidateUserTokensUseCase) {}

  @Post(':userId/invalidate-tokens')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'admin.user.tokens_invalidated', resource: 'User' })
  @ApiOperation({
    summary: 'Invalidate every existing access token for a user (super admin only)',
  })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Tokens invalidated' })
  @ApiAuthErrors()
  @ApiNotFoundError('User')
  @ApiServerError()
  async invalidate(@Param('userId', ParseUUIDPipe) userId: string): Promise<void> {
    return this.invalidateUserTokens.execute({ userId });
  }
}
