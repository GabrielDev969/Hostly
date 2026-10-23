import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import type { PairStartResponse } from '@hostly/contracts';
import { CryptoUtil } from '@shared/utils/crypto.util';
import { RobotPairingsRepository } from '../repositories/robot-pairings.repository.interface';
import { PairingRateLimiter } from '../services/pairing-rate-limiter.service';

export const PAIRING_TTL_MS = 10 * 60_000;
const CODE_ATTEMPTS = 5;

interface StartPairingInput {
  serial: string;
  ip: string;
}

@Injectable()
export class StartPairingUseCase {
  constructor(
    private pairings: RobotPairingsRepository,
    private limiter: PairingRateLimiter,
  ) {}

  async execute(input: StartPairingInput): Promise<PairStartResponse> {
    await this.limiter.hitStart(input.ip);
    const now = new Date();
    // Expired pairings would keep holding their codes.
    await this.pairings.deleteExpired(now);
    const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS);

    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      const pairingId = randomUUID();
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      const pairing = await this.pairings.create({
        pollKeyHash: CryptoUtil.hashToken(pairingId),
        serial: input.serial,
        code,
        expiresAt,
      });
      if (pairing) return { pairingId, code, expiresAt: expiresAt.toISOString() };
    }
    throw new ServiceUnavailableException('No pairing code available; try again');
  }
}
