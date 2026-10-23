import { Injectable } from '@nestjs/common';
import { RobotsRepository } from '../repositories/robots.repository.interface';
import { PairingCodesService } from '../services/pairing-codes.service';
import { PairingLookupResponseDto } from '../http/dto/pairing-lookup-response.dto';
import { toRobotDto } from '../http/dto/robot-response.dto';

interface LookupPairingInput {
  userId: string;
  code: string;
}

@Injectable()
export class LookupPairingUseCase {
  constructor(
    private codes: PairingCodesService,
    private robots: RobotsRepository,
  ) {}

  async execute(input: LookupPairingInput): Promise<PairingLookupResponseDto> {
    const pairing = await this.codes.findPending(input.userId, input.code);
    const robot = await this.robots.findBySerial(pairing.serial);
    return {
      serial: pairing.serial,
      expiresAt: pairing.expiresAt,
      robot: robot ? toRobotDto(robot) : null,
    };
  }
}
