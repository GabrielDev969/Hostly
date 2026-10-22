import { Injectable, Logger } from '@nestjs/common';
import { TenantContext } from '@shared/tenancy/tenant-context';
import {
  AuditLogsRepository,
  CreateAuditLogData,
} from '../repositories/audit-logs.repository.interface';

export interface AuditRecord {
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly logs: AuditLogsRepository) {}

  async log(data: CreateAuditLogData): Promise<void> {
    const scope = TenantContext.scope;
    try {
      await this.logs.create({
        ...data,
        workspaceId: data.workspaceId ?? scope?.workspaceId ?? null,
        organizationId: data.organizationId ?? scope?.organizationId ?? null,
        clientId: data.clientId ?? scope?.clientId ?? null,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : undefined;

      this.logger.error('Failed to write audit log', {
        err: errorMessage,
        stack: errorStack,
        action: data.action,
      });
    }
  }

  // Use-case helper in the spec's vocabulary (actorId, action, entity, entityId); scope comes from the context.
  async record(entry: AuditRecord): Promise<void> {
    await this.log({
      userId: entry.actorId,
      action: entry.action,
      resource: entry.entity,
      resourceId: entry.entityId,
      metadata: entry.metadata ?? null,
    });
  }
}
