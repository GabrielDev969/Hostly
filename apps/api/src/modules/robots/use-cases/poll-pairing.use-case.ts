import { Injectable } from '@nestjs/common';
import type { PairPollResponse } from '@hostly/contracts';
import { CryptoUtil } from '@shared/utils/crypto.util';
import { TenantContext } from '@shared/tenancy/tenant-context';
import { RobotPairingsRepository } from '../repositories/robot-pairings.repository.interface';
import { PairingRateLimiter } from '../services/pairing-rate-limiter.service';

@Injectable()
export class PollPairingUseCase {
  constructor(
    private pairings: RobotPairingsRepository,
    private limiter: PairingRateLimiter,
  ) {}

  // Unknown, expired and already delivered pairings all answer "expired".
  async execute(pairingId: string): Promise<PairPollResponse> {
    const pollKeyHash = CryptoUtil.hashToken(pairingId);
    await this.limiter.hitPoll(pollKeyHash);

    const now = new Date();
    const pairing = await this.pairings.findByPollKeyHash(pollKeyHash);
    if (!pairing || pairing.expiresAt <= now) return { status: 'expired' };
    if (pairing.status === 'pending') {
      return { status: 'pending', expiresAt: pairing.expiresAt.toISOString() };
    }

    // Generated on delivery, not on approval, so the raw token never reaches the database.
    const deviceToken = CryptoUtil.generateToken(32);
    const claimed = await TenantContext.runAsSystem(() =>
      this.pairings.claimApproved({
        pairingId: pairing.id,
        robotId: pairing.robotId,
        deviceTokenHash: CryptoUtil.hashToken(deviceToken),
        now,
      }),
    );
    return claimed
      ? { status: 'approved', robotId: pairing.robotId, deviceToken }
      : { status: 'expired' };
  }
}
