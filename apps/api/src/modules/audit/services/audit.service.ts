import { Injectable, Logger } from '@nestjs/common';
import {
  AuditLogsRepository,
  CreateAuditLogData,
} from '../repositories/audit-logs.repository.interface';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly logs: AuditLogsRepository) {}

  async log(data: CreateAuditLogData): Promise<void> {
    try {
      await this.logs.create(data);
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
}
