import { Injectable, Logger } from '@nestjs/common';
import { AuditLogsRepository } from '../repositories/audit-logs.repository.interface';
import { env } from 'src/config/env.config';

@Injectable()
export class CleanupOldAuditLogsUseCase {
  private readonly logger = new Logger('CleanupOldAuditLogs');

  constructor(private readonly auditLogs: AuditLogsRepository) {}

  async execute(): Promise<{ deleted: number }> {
    const cutoff = new Date(Date.now() - env.AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const deleted = await this.auditLogs.deleteOlderThan(cutoff);
    if (deleted > 0) {
      this.logger.log({
        msg: 'Deleted old audit logs',
        deleted,
        retentionDays: env.AUDIT_RETENTION_DAYS,
      });
    }
    return { deleted };
  }
}
