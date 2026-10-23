import { HttpException } from '@nestjs/common';
import { pairPollResponseSchema } from '@hostly/contracts';
import { CryptoUtil } from '@shared/utils/crypto.util';
import { TenantContext } from '@shared/tenancy/tenant-context';
import { PollPairingUseCase } from './poll-pairing.use-case';
import { RobotPairingsRepository } from '../repositories/robot-pairings.repository.interface';
import { PairingRateLimiter } from '../services/pairing-rate-limiter.service';
import { RobotPairing } from '../entities/robot-pairing.entity';

const PAIRING_ID = '0b6f0c39-6b8e-4f0e-9f57-0f6a3c1f4a11';
const ROBOT_ID = '6c1d7f8e-2a3b-4c5d-8e9f-0a1b2c3d4e5f';

describe('PollPairingUseCase', () => {
  let pairings: jest.Mocked<RobotPairingsRepository>;
  let limiter: jest.Mocked<Pick<PairingRateLimiter, 'hitPoll'>>;
  let useCase: PollPairingUseCase;

  const pairing = (overrides: Partial<RobotPairing> = {}): RobotPairing =>
    ({
      id: 'p1',
      serial: 'LB-01',
      code: '123456',
      status: 'pending',
      robotId: null,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      ...overrides,
    }) as RobotPairing;

  beforeEach(() => {
    pairings = {
      deleteExpired: jest.fn(),
      create: jest.fn(),
      findPendingByCode: jest.fn(),
      findByPollKeyHash: jest.fn().mockResolvedValue(pairing()),
      approve: jest.fn(),
      claimApproved: jest.fn().mockResolvedValue(true),
    };
    limiter = { hitPoll: jest.fn() };
    useCase = new PollPairingUseCase(pairings, limiter as unknown as PairingRateLimiter);
  });

  it('looks the pairing up and rate limits it by the hash of its id', async () => {
    await useCase.execute(PAIRING_ID);

    expect(limiter.hitPoll).toHaveBeenCalledWith(CryptoUtil.hashToken(PAIRING_ID));
    expect(pairings.findByPollKeyHash).toHaveBeenCalledWith(CryptoUtil.hashToken(PAIRING_ID));
  });

  it('answers pending with the expiry while waiting for approval', async () => {
    const result = await useCase.execute(PAIRING_ID);

    expect(result).toMatchObject({ status: 'pending' });
    expect(pairPollResponseSchema.safeParse(result).success).toBe(true);
  });

  it.each([
    ['unknown', null],
    ['expired', pairing({ expiresAt: new Date(Date.now() - 1) })],
  ])('answers expired for an %s pairing', async (_, found) => {
    pairings.findByPollKeyHash.mockResolvedValue(found);

    await expect(useCase.execute(PAIRING_ID)).resolves.toEqual({ status: 'expired' });
    expect(pairings.claimApproved).not.toHaveBeenCalled();
  });

  it('delivers a fresh token once approved and stores only its hash, as system work', async () => {
    pairings.findByPollKeyHash.mockResolvedValue(
      pairing({ status: 'approved', robotId: ROBOT_ID }),
    );
    let system = false;
    pairings.claimApproved.mockImplementation(() => {
      system = TenantContext.isSystem;
      return Promise.resolve(true);
    });

    const result = await useCase.execute(PAIRING_ID);

    expect(pairPollResponseSchema.safeParse(result).success).toBe(true);
    if (result.status !== 'approved') throw new Error('expected approved');
    expect(result.robotId).toBe(ROBOT_ID);
    expect(pairings.claimApproved).toHaveBeenCalledWith(
      expect.objectContaining({
        pairingId: 'p1',
        robotId: ROBOT_ID,
        deviceTokenHash: CryptoUtil.hashToken(result.deviceToken),
      }),
    );
    expect(system).toBe(true);
  });

  it('answers expired when another poll claimed the token first', async () => {
    pairings.findByPollKeyHash.mockResolvedValue(
      pairing({ status: 'approved', robotId: ROBOT_ID }),
    );
    pairings.claimApproved.mockResolvedValue(false);

    await expect(useCase.execute(PAIRING_ID)).resolves.toEqual({ status: 'expired' });
  });

  it('refuses polls faster than the limit before touching the database', async () => {
    limiter.hitPoll.mockRejectedValue(new HttpException('Too many', 429));

    await expect(useCase.execute(PAIRING_ID)).rejects.toThrow('Too many');
    expect(pairings.findByPollKeyHash).not.toHaveBeenCalled();
  });
});
