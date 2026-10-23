import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PERMISSIONS } from '@modules/rbac/constants/permissions';
import { SitesRepository } from '@modules/sites/repositories/sites.repository.interface';
import { Robot } from '../entities/robot.entity';
import { RobotPairingsRepository } from '../repositories/robot-pairings.repository.interface';
import { PairingCodesService } from '../services/pairing-codes.service';
import { RobotResponseDto, toRobotDto } from '../http/dto/robot-response.dto';

// An approval near the end of the code's validity still leaves the robot time to fetch its token.
export const DELIVERY_GRACE_MS = 60_000;

interface ApprovePairingInput {
  userId: string;
  code: string;
  siteId: string;
  name?: string;
  // Effective permissions of the caller, already cut by the scope's ceiling.
  permissions: string[];
}

// Pairing an existing robot again revokes, moves or renames it: each needs its own permission.
function assertCanReplace(existing: Robot, input: ApprovePairingInput): void {
  const changes: [boolean, string, string][] = [
    [existing.status === 'active', PERMISSIONS.ROBOT.REVOKE, 'it is active and loses its token'],
    [existing.siteId !== input.siteId, PERMISSIONS.ROBOT.MOVE, 'the site changes'],
    [
      input.name !== undefined && input.name !== existing.name,
      PERMISSIONS.ROBOT.UPDATE,
      'the name changes',
    ],
  ];
  const missing = changes.filter(
    ([applies, permission]) => applies && !input.permissions.includes(permission),
  );
  if (missing.length > 0) {
    const reasons = missing.map(([, permission, why]) => `${permission} (${why})`).join(', ');
    throw new ForbiddenException(`Pairing this robot again requires ${reasons}`);
  }
}

@Injectable()
export class ApprovePairingUseCase {
  constructor(
    private codes: PairingCodesService,
    private pairings: RobotPairingsRepository,
    private sites: SitesRepository,
  ) {}

  async execute(input: ApprovePairingInput): Promise<RobotResponseDto> {
    const pairing = await this.codes.findPending(input.userId, input.code);
    const site = await this.sites.findById(input.siteId);
    if (!site) throw new NotFoundException('Site not found');

    const result = await this.pairings.approve({
      pairingId: pairing.id,
      serial: pairing.serial,
      siteId: site.id,
      clientId: site.clientId,
      name: input.name,
      expiresAt: new Date(Math.max(pairing.expiresAt.getTime(), Date.now() + DELIVERY_GRACE_MS)),
      authorizeExisting: (existing) => assertCanReplace(existing, input),
    });
    // Never says which organization holds the serial.
    if (result.status === 'serial_taken') {
      throw new ConflictException('This robot is registered to another organization');
    }
    if (result.status === 'not_pending') {
      throw new ConflictException('This pairing was already approved');
    }
    return toRobotDto(result.robot);
  }
}
