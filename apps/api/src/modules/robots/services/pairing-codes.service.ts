import { Injectable, NotFoundException } from '@nestjs/common';
import { RobotPairing } from '../entities/robot-pairing.entity';
import { RobotPairingsRepository } from '../repositories/robot-pairings.repository.interface';
import { PairingRateLimiter } from './pairing-rate-limiter.service';

// Resolves the code typed in the panel; every miss counts against the user's attempts.
@Injectable()
export class PairingCodesService {
  constructor(
    private pairings: RobotPairingsRepository,
    private limiter: PairingRateLimiter,
  ) {}

  async findPending(userId: string, code: string): Promise<RobotPairing> {
    await this.limiter.assertCodeAttemptsLeft(userId);
    const pairing = await this.pairings.findPendingByCode(code, new Date());
    if (!pairing) {
      await this.limiter.recordWrongCode(userId);
      // Same answer for a wrong and an expired code.
      throw new NotFoundException('Pairing code not found or expired');
    }
    return pairing;
  }
}
