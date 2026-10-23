import { Injectable, NotFoundException } from '@nestjs/common';
import { RobotPairing } from '../entities/robot-pairing.entity';
import { RobotPairingsRepository } from '../repositories/robot-pairings.repository.interface';
import { PairingRateLimiter } from './pairing-rate-limiter.service';

// Resolves the code typed in the panel; only misses count against the user's attempts.
@Injectable()
export class PairingCodesService {
  constructor(
    private pairings: RobotPairingsRepository,
    private limiter: PairingRateLimiter,
  ) {}

  async findPending(userId: string, code: string): Promise<RobotPairing> {
    await this.limiter.reserveCodeAttempt(userId);
    const pairing = await this.pairings.findPendingByCode(code, new Date());
    // Same answer for a wrong and an expired code; the reserved attempt stays counted.
    if (!pairing) throw new NotFoundException('Pairing code not found or expired');
    await this.limiter.refundCodeAttempt(userId);
    return pairing;
  }
}
