import { Injectable } from '@nestjs/common';
import { Robot as RobotRow } from '@prisma/client';
import { ScopedPrismaService } from '@shared/tenancy/scoped-prisma.service';
import { Robot, RobotLastTelemetry } from '../entities/robot.entity';
import { RobotsFilter, RobotsRepository, UpdateRobotData } from './robots.repository.interface';

// The columns are written together, from one telemetry message.
function lastTelemetry(raw: RobotRow): RobotLastTelemetry | null {
  if (!raw.telemetryAt || !raw.mode || raw.emergency === null) return null;
  return {
    at: raw.telemetryAt,
    battery: raw.battery,
    charging: raw.charging,
    pose:
      raw.poseX !== null && raw.poseY !== null && raw.poseTheta !== null
        ? { x: raw.poseX, y: raw.poseY, theta: raw.poseTheta }
        : null,
    mode: raw.mode,
    emergency: raw.emergency,
    nowPlayingAssetId: raw.nowPlayingAssetId,
  };
}

export function toRobot(raw: RobotRow): Robot {
  return {
    id: raw.id,
    organizationId: raw.organizationId,
    clientId: raw.clientId,
    siteId: raw.siteId,
    serial: raw.serial,
    model: raw.model,
    name: raw.name,
    romVersion: raw.romVersion,
    appVersion: raw.appVersion,
    manifestVersion: raw.manifestVersion,
    status: raw.status,
    online: raw.online,
    lastSeenAt: raw.lastSeenAt,
    telemetry: lastTelemetry(raw),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

@Injectable()
export class PrismaRobotsRepository extends RobotsRepository {
  constructor(private scoped: ScopedPrismaService) {
    super();
  }

  async findMany(filter: RobotsFilter): Promise<Robot[]> {
    const robots = await this.scoped.client.robot.findMany({
      where: { clientId: filter.clientId, siteId: filter.siteId, status: filter.status },
      orderBy: { name: 'asc' },
    });
    return robots.map(toRobot);
  }

  async findById(id: string): Promise<Robot | null> {
    const robot = await this.scoped.client.robot.findFirst({ where: { id } });
    return robot ? toRobot(robot) : null;
  }

  async findBySerial(serial: string): Promise<Robot | null> {
    const robot = await this.scoped.client.robot.findFirst({ where: { serial } });
    return robot ? toRobot(robot) : null;
  }

  async update(id: string, data: UpdateRobotData): Promise<Robot> {
    return toRobot(await this.scoped.client.robot.update({ where: { id }, data }));
  }

  // Site, then robot: the lock order in prisma-robot-pairings.repository.ts.
  async moveToSite(id: string, site: { id: string; clientId: string }): Promise<Robot | null> {
    return this.scoped.client.$transaction(async (tx) => {
      const { count } = await tx.site.updateMany({
        where: { id: site.id, deletedAt: null },
        data: { updatedAt: new Date() },
      });
      if (count === 0) return null;
      const robot = await tx.robot.update({
        where: { id },
        data: { siteId: site.id, clientId: site.clientId },
      });
      return toRobot(robot);
    });
  }

  // Robot, then its pairings: the lock order in prisma-robot-pairings.repository.ts.
  async revoke(id: string): Promise<Robot> {
    return this.scoped.client.$transaction(async (tx) => {
      const robot = await tx.robot.update({
        where: { id },
        data: { status: 'revoked', deviceTokenHash: null },
      });
      await tx.robotPairing.deleteMany({ where: { robotId: id } });
      return toRobot(robot);
    });
  }

  async findActiveByTokenHash(deviceTokenHash: string): Promise<Robot | null> {
    const robot = await this.scoped.client.robot.findFirst({
      where: { deviceTokenHash, status: 'active' },
    });
    return robot ? toRobot(robot) : null;
  }
}
