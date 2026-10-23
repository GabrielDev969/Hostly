import { Injectable } from '@nestjs/common';
import { Robot as RobotRow } from '@prisma/client';
import { ScopedPrismaService } from '@shared/tenancy/scoped-prisma.service';
import { Robot } from '../entities/robot.entity';
import { RobotsFilter, RobotsRepository, UpdateRobotData } from './robots.repository.interface';

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
    status: raw.status,
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

  // Robot first, then its pairings: the lock order of approving and claiming, so they never deadlock.
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
