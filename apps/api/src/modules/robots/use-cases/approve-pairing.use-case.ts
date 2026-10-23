import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SitesRepository } from '@modules/sites/repositories/sites.repository.interface';
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
