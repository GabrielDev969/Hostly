import { Injectable } from '@nestjs/common';
import { ScopedPrismaService } from '@shared/tenancy/scoped-prisma.service';
import type { TelemetrySample } from '../services/telemetry-buckets';
import { TelemetryHistoryRepository } from './telemetry-history.repository.interface';

@Injectable()
export class PrismaTelemetryHistoryRepository extends TelemetryHistoryRepository {
  constructor(private scoped: ScopedPrismaService) {
    super();
  }

  async findSince(robotId: string, since: Date): Promise<TelemetrySample[]> {
    return this.scoped.client.telemetrySnapshot.findMany({
      where: { robotId, ts: { gte: since } },
      select: { ts: true, battery: true, charging: true, mode: true },
      orderBy: { ts: 'asc' },
    });
  }
}
