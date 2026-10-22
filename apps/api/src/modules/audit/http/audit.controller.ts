import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ListAuditLogsUseCase } from '../use-cases/list-audit-logs.use-case';
import { VerifyAuditChainUseCase } from '../use-cases/verify-audit-chain.use-case';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { AuditLogResponseDto } from './dto/audit-log-response.dto';
import { VerifyAuditChainResponseDto } from './dto/verify-audit-chain-response.dto';
import { WorkspaceGuard } from '@shared/guards/workspace.guard';
import { PermissionsGuard } from '@shared/guards/permissions.guard';
import { RequirePermissions } from '@shared/decorators/require-permissions.decorator';
import { PERMISSIONS } from '@modules/rbac/constants/permissions';
import { PaginatedResponseDto } from '@shared/dto/paginated-response.dto';
import {
  ApiAuthErrors,
  ApiServerError,
  ApiValidationError,
} from '@shared/swagger/api-errors.decorator';
import type { WorkspaceContext } from '@shared/types/workspace-context.type';
import { CurrentWorkspace } from '@shared/decorators/current-workspace.decorator';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller({ path: 'audit-logs', version: '1' })
@UseGuards(WorkspaceGuard, PermissionsGuard)
export class AuditController {
  constructor(
    private readonly listAuditLogs: ListAuditLogsUseCase,
    private readonly verifyChain: VerifyAuditChainUseCase,
  ) {}

  @Get('verify')
  @RequirePermissions(PERMISSIONS.AUDIT.READ)
  @ApiOperation({
    summary: 'Verify the hash chain of audit logs (tamper-evidence). Walks every row.',
  })
  @ApiResponse({ status: 200, type: VerifyAuditChainResponseDto })
  @ApiAuthErrors()
  @ApiServerError()
  async verify(): Promise<VerifyAuditChainResponseDto> {
    return this.verifyChain.execute();
  }

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT.READ)
  @ApiOperation({ summary: 'List audit logs in the workspace' })
  @ApiResponse({ status: 200, type: PaginatedResponseDto<AuditLogResponseDto> })
  @ApiValidationError()
  @ApiAuthErrors()
  @ApiServerError()
  async list(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Query() query: ListAuditLogsQueryDto,
  ): Promise<PaginatedResponseDto<AuditLogResponseDto>> {
    return this.listAuditLogs.execute({
      workspaceId: workspace.id,
      userId: query.userId,
      action: query.action,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page: query.page,
      limit: query.limit,
    });
  }
}
