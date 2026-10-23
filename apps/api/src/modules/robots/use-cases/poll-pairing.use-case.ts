import { Injectable } from '@nestjs/common';
import type { PairPollResponse } from '@hostly/contracts';
import { CryptoUtil } from '@shared/utils/crypto.util';
import { TenantContext } from '@shared/tenancy/tenant-context';
import { RobotPairingsRepository } from '../repositories/robot-pairings.repository.interface';
import { PairingRateLimiter } from '../services/pairing-rate-limiter.service';
import { RobotTokenEvents } from '../services/robot-token-events.service';

@Injectable()
export class PollPairingUseCase {
  constructor(
    private pairings: RobotPairingsRepository,
    private limiter: PairingRateLimiter,
    private tokenEvents: RobotTokenEvents,
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
    const deviceTokenHash = CryptoUtil.hashToken(deviceToken);
    const claimed = await TenantContext.runAsSystem(() =>
      this.pairings.claimApproved({
        pairingId: pairing.id,
        robotId: pairing.robotId,
        deviceTokenHash,
        now,
      }),
    );
    if (!claimed) return { status: 'expired' };
    // The new token replaces any older one: a socket still open with it closes before the token is handed out.
    this.tokenEvents.emit({ robotId: pairing.robotId, activeTokenHash: deviceTokenHash });
    return { status: 'approved', robotId: pairing.robotId, deviceToken };
  }
}
