import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE } from '@shared/queues/queue-names';
import { AnonymizeExpiredUsersUseCase } from '@modules/users/use-cases/anonymize-expired-users.use-case';
import { CleanupExpiredSessionsUseCase } from '@modules/sessions/use-cases/cleanup-expired-sessions.use-case';
import { CleanupExpiredTokensUseCase } from '@modules/auth/use-cases/cleanup-expired-tokens.use-case';
import { CleanupOldAuditLogsUseCase } from '@modules/audit/use-cases/cleanup-old-audit-logs.use-case';
import {
  ANONYMIZE_EXPIRED_USERS_JOB,
  CLEANUP_EXPIRED_SESSIONS_JOB,
  CLEANUP_EXPIRED_TOKENS_JOB,
  CLEANUP_OLD_AUDIT_LOGS_JOB,
} from './maintenance.jobs';

@Processor(QUEUE.maintenance)
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger('Worker:Maintenance');

  constructor(
    private readonly anonymize: AnonymizeExpiredUsersUseCase,
    private readonly cleanupSessions: CleanupExpiredSessionsUseCase,
    private readonly cleanupTokens: CleanupExpiredTokensUseCase,
    private readonly cleanupAudit: CleanupOldAuditLogsUseCase,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case ANONYMIZE_EXPIRED_USERS_JOB:
        await this.anonymize.execute();
        return;
      case CLEANUP_EXPIRED_SESSIONS_JOB:
        await this.cleanupSessions.execute();
        return;
      case CLEANUP_EXPIRED_TOKENS_JOB:
        await this.cleanupTokens.execute();
        return;
      case CLEANUP_OLD_AUDIT_LOGS_JOB:
        await this.cleanupAudit.execute();
        return;
      default:
        this.logger.warn({ msg: 'Unknown maintenance job', name: job.name });
    }
  }
}
