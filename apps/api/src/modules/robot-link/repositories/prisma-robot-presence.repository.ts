import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ScopedPrismaService } from '@shared/tenancy/scoped-prisma.service';
import {
  HelloData,
  RobotPresenceRepository,
  RobotWrite,
  TelemetryData,
  WentOffline,
} from './robot-presence.repository.interface';

type RobotData = Prisma.RobotUpdateManyMutationInput;
type SnapshotData = Omit<
  Prisma.TelemetrySnapshotUncheckedCreateInput,
  'id' | 'organizationId' | 'clientId' | 'robotId'
>;

const offlineSelect = { id: true, organizationId: true, clientId: true } as const;

const toWentOffline = (row: { id: string; organizationId: string; clientId: string }) => ({
  robotId: row.id,
  organizationId: row.organizationId,
  clientId: row.clientId,
});

@Injectable()
export class PrismaRobotPresenceRepository extends RobotPresenceRepository {
  constructor(private scoped: ScopedPrismaService) {
    super();
  }

  async recordHello(robotId: string, data: HelloData): Promise<RobotWrite | null> {
    return this.write(robotId, {
      romVersion: data.romVersion,
      appVersion: data.appVersion,
      manifestVersion: data.manifestVersion,
      lastSeenAt: data.at,
    });
  }

  async recordTelemetry(robotId: string, data: TelemetryData): Promise<RobotWrite | null> {
    const state = {
      battery: data.battery,
      charging: data.charging,
      poseX: data.pose?.x ?? null,
      poseY: data.pose?.y ?? null,
      poseTheta: data.pose?.theta ?? null,
      mode: data.mode,
      emergency: data.emergency,
    };
    return this.write(
      robotId,
      {
        ...state,
        nowPlayingAssetId: data.nowPlayingAssetId,
        telemetryAt: data.at,
        lastSeenAt: data.at,
      },
      { ...state, ts: data.at },
    );
  }

  async touch(robotId: string, at: Date): Promise<RobotWrite | null> {
    return this.write(robotId, { lastSeenAt: at });
  }

  // Organization scope: the robot may have changed client since it connected, and the token may be gone.
  async markOffline(robotId: string): Promise<WentOffline | null> {
    const [row] = await this.scoped.client.robot.updateManyAndReturn({
      where: { id: robotId, online: true },
      data: { online: false },
      select: offlineSelect,
    });
    return row ? toWentOffline(row) : null;
  }

  async markStaleOffline(seenBefore: Date): Promise<WentOffline[]> {
    const rows = await this.scoped.client.robot.updateManyAndReturn({
      where: { online: true, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: seenBefore } }] },
      data: { online: false },
      select: offlineSelect,
    });
    return rows.map(toWentOffline);
  }

  async deleteTelemetryOlderThan(cutoff: Date): Promise<number> {
    const { count } = await this.scoped.client.telemetrySnapshot.deleteMany({
      where: { ts: { lt: cutoff } },
    });
    return count;
  }

  // Flipping online first locks the row, so a concurrent offline write cannot interleave; the history row gets
  // its organization and client from the scope, that is, from where the robot is right now.
  private async write(
    robotId: string,
    data: RobotData,
    snapshot?: SnapshotData,
  ): Promise<RobotWrite | null> {
    return this.scoped.client.$transaction(async (tx) => {
      const flipped = await tx.robot.updateMany({
        where: { id: robotId, status: 'active', online: false },
        data: { online: true },
      });
      const { count } = await tx.robot.updateMany({
        where: { id: robotId, status: 'active' },
        data,
      });
      if (count === 0) return null;
      if (snapshot) {
        await tx.telemetrySnapshot.create({
          // The tenant-scope extension stamps organizationId and clientId; the Prisma type cannot know that.
          data: { robotId, ...snapshot } as Prisma.TelemetrySnapshotUncheckedCreateInput,
        });
      }
      return { cameOnline: flipped.count === 1 };
    });
  }
}
