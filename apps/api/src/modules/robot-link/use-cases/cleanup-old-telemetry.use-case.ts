import { Injectable, Logger } from '@nestjs/common';
import { env } from 'src/config/env.config';
import { TenantContext } from '@shared/tenancy/tenant-context';
import { RobotPresenceRepository } from '../repositories/robot-presence.repository.interface';

@Injectable()
export class CleanupOldTelemetryUseCase {
  private readonly logger = new Logger('CleanupOldTelemetry');

  constructor(private readonly presence: RobotPresenceRepository) {}

  // The last state stays on the Robot; only the history is pruned.
  async execute(): Promise<{ deleted: number }> {
    const cutoff = new Date(Date.now() - env.TELEMETRY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const deleted = await TenantContext.runAsSystem(() =>
      this.presence.deleteTelemetryOlderThan(cutoff),
    );
    if (deleted > 0) {
      this.logger.log({
        msg: 'Deleted old telemetry',
        deleted,
        retentionDays: env.TELEMETRY_RETENTION_DAYS,
      });
    }
    return { deleted };
  }
}
