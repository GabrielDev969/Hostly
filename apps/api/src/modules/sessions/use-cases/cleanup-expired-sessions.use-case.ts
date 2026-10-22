import { Injectable, Logger } from '@nestjs/common';
import { SessionsRepository } from '../repositories/sessions.repository.interface';
import { env } from 'src/config/env.config';

@Injectable()
export class CleanupExpiredSessionsUseCase {
  private readonly logger = new Logger('CleanupExpiredSessions');

  constructor(private readonly sessions: SessionsRepository) {}

  async execute(): Promise<{ deleted: number }> {
    const deleted = await this.sessions.deleteExpired(env.SESSION_RETENTION_DAYS);
    if (deleted > 0) {
      this.logger.log({
        msg: 'Deleted expired sessions',
        deleted,
        retentionDays: env.SESSION_RETENTION_DAYS,
      });
    }
    return { deleted };
  }
}
