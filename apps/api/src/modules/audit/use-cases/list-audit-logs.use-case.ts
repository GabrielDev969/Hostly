import { Injectable } from '@nestjs/common';
import { AuditLogsRepository } from '../repositories/audit-logs.repository.interface';
import { PaginatedResponseDto } from '@shared/dto/paginated-response.dto';
import { AuditLogResponseDto } from '../http/dto/audit-log-response.dto';

interface ListAuditLogsInput {
  workspaceId: string;
  userId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

@Injectable()
export class ListAuditLogsUseCase {
  constructor(private readonly logs: AuditLogsRepository) {}

  async execute(input: ListAuditLogsInput): Promise<PaginatedResponseDto<AuditLogResponseDto>> {
    const { items, total } = await this.logs.findMany(input);

    return {
      data: items.map((log) => ({
        id: log.id,
        userId: log.userId,
        action: log.action,
        resource: log.resource,
        resourceId: log.resourceId,
        metadata: log.metadata,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        createdAt: log.createdAt,
      })),
      meta: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.ceil(total / input.limit),
      },
    };
  }
}
