import { Injectable } from '@nestjs/common';
import { Prisma, RobotPairing as RobotPairingRow } from '@prisma/client';
import { ScopedPrismaService } from '@shared/tenancy/scoped-prisma.service';
import { RobotPairing } from '../entities/robot-pairing.entity';
import { toRobot } from './prisma-robots.repository';
import {
  ApprovePairingData,
  ApprovePairingResult,
  ClaimPairingData,
  CreatePairingData,
  RobotPairingsRepository,
} from './robot-pairings.repository.interface';

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

class PairingNotPending extends Error {}
class ClaimLost extends Error {}

// RobotPairing has no tenant column, so the scoped client passes it through untouched; it is used
// here so a transaction can span the pairing and the scoped Robot.
//
// Approving, claiming and revoking all lock the robot row first and its pairings second: one lock
// order, so they never deadlock, and each sees the robot as the others left it.
@Injectable()
export class PrismaRobotPairingsRepository extends RobotPairingsRepository {
  constructor(private scoped: ScopedPrismaService) {
    super();
  }

  async deleteExpired(now: Date): Promise<void> {
    await this.scoped.client.robotPairing.deleteMany({ where: { expiresAt: { lte: now } } });
  }

  // pollKeyHash comes from a random UUID, so a unique violation can only be the code.
  async create(data: CreatePairingData): Promise<RobotPairing | null> {
    try {
      return this.toEntity(await this.scoped.client.robotPairing.create({ data }));
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  async findPendingByCode(code: string, now: Date): Promise<RobotPairing | null> {
    const pairing = await this.scoped.client.robotPairing.findFirst({
      where: { code, status: 'pending', expiresAt: { gt: now } },
    });
    return pairing ? this.toEntity(pairing) : null;
  }

  async findByPollKeyHash(pollKeyHash: string): Promise<RobotPairing | null> {
    const pairing = await this.scoped.client.robotPairing.findUnique({ where: { pollKeyHash } });
    return pairing ? this.toEntity(pairing) : null;
  }

  async approve(data: ApprovePairingData): Promise<ApprovePairingResult> {
    try {
      return await this.scoped.client.$transaction(async (tx) => {
        // Touching the row locks it, so no token delivery changes it between the check and the write.
        await tx.robot.updateMany({
          where: { serial: data.serial },
          data: { updatedAt: new Date() },
        });
        const existing = await tx.robot.findFirst({ where: { serial: data.serial } });
        if (existing) data.authorizeExisting(toRobot(existing));
        const robot = existing
          ? await tx.robot.update({
              where: { id: existing.id },
              data: { siteId: data.siteId, clientId: data.clientId, name: data.name },
            })
          : await tx.robot.create({
              // The tenant-scope extension stamps organizationId; the Prisma type cannot know that.
              data: {
                serial: data.serial,
                siteId: data.siteId,
                clientId: data.clientId,
                name: data.name ?? data.serial,
              } as Prisma.RobotUncheckedCreateInput,
            });
        const { count } = await tx.robotPairing.updateMany({
          where: { id: data.pairingId, status: 'pending' },
          data: { status: 'approved', robotId: robot.id, expiresAt: data.expiresAt },
        });
        if (count === 0) throw new PairingNotPending();
        return { status: 'approved', robot: toRobot(robot) };
      });
    } catch (error) {
      if (error instanceof PairingNotPending) return { status: 'not_pending' };
      if (isUniqueViolation(error)) return this.serialConflict(data.serial);
      throw error;
    }
  }

  // Robot ids are random UUIDs, so the violation is the serial: a concurrent approval in this
  // organization (a double click) created it, or another organization holds it.
  private async serialConflict(serial: string): Promise<ApprovePairingResult> {
    const own = await this.scoped.client.robot.findFirst({ where: { serial } });
    return own ? { status: 'not_pending' } : { status: 'serial_taken' };
  }

  // A concurrent poll waits on the robot lock, then finds nothing to claim. Delivering drops the
  // robot's other approvals: each was authorized against the robot as it was before this token,
  // so none may replace it later (that would revoke it without robot:revoke).
  async claimApproved(data: ClaimPairingData): Promise<boolean> {
    try {
      return await this.scoped.client.$transaction(async (tx) => {
        await tx.robot.updateMany({ where: { id: data.robotId }, data: { updatedAt: data.now } });
        const { count } = await tx.robotPairing.deleteMany({
          where: { id: data.pairingId, status: 'approved', expiresAt: { gt: data.now } },
        });
        if (count === 0) throw new ClaimLost();
        await tx.robotPairing.deleteMany({ where: { robotId: data.robotId } });
        await tx.robot.update({
          where: { id: data.robotId },
          data: { status: 'active', deviceTokenHash: data.deviceTokenHash },
        });
        return true;
      });
    } catch (error) {
      if (error instanceof ClaimLost) return false;
      throw error;
    }
  }

  private toEntity(raw: RobotPairingRow): RobotPairing {
    const fields = {
      id: raw.id,
      serial: raw.serial,
      code: raw.code,
      expiresAt: raw.expiresAt,
      createdAt: raw.createdAt,
    };
    return raw.status === 'approved' && raw.robotId
      ? { ...fields, status: 'approved', robotId: raw.robotId }
      : { ...fields, status: 'pending', robotId: null };
  }
}
