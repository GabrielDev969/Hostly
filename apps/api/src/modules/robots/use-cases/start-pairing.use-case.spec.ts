import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { pairStartResponseSchema } from '@hostly/contracts';
import { CryptoUtil } from '@shared/utils/crypto.util';
import { PAIRING_TTL_MS, StartPairingUseCase } from './start-pairing.use-case';
import { RobotPairingsRepository } from '../repositories/robot-pairings.repository.interface';
import { PairingRateLimiter } from '../services/pairing-rate-limiter.service';

describe('StartPairingUseCase', () => {
  let pairings: jest.Mocked<RobotPairingsRepository>;
  let limiter: jest.Mocked<Pick<PairingRateLimiter, 'hitStart'>>;
  let useCase: StartPairingUseCase;

  beforeEach(() => {
    pairings = {
      deleteExpired: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'p1' }),
      findPendingByCode: jest.fn(),
      findByPollKeyHash: jest.fn(),
      approve: jest.fn(),
      claimApproved: jest.fn(),
    };
    limiter = { hitStart: jest.fn() };
    useCase = new StartPairingUseCase(pairings, limiter as unknown as PairingRateLimiter);
  });

  it('returns a contract response with a six-digit code valid for 10 minutes', async () => {
    const before = Date.now();
    const result = await useCase.execute({ serial: 'LB-01', ip: '10.0.0.1' });

    expect(pairStartResponseSchema.safeParse(result).success).toBe(true);
    expect(result.code).toMatch(/^\d{6}$/);
    expect(new Date(result.expiresAt).getTime() - before).toBeGreaterThanOrEqual(PAIRING_TTL_MS);
    expect(limiter.hitStart).toHaveBeenCalledWith('10.0.0.1');
    expect(pairings.deleteExpired).toHaveBeenCalled();
  });

  it('stores only the hash of the pairingId', async () => {
    const result = await useCase.execute({ serial: 'LB-01', ip: '10.0.0.1' });

    const stored = pairings.create.mock.calls[0]![0];
    expect(stored.pollKeyHash).toBe(CryptoUtil.hashToken(result.pairingId));
    expect(JSON.stringify(stored)).not.toContain(result.pairingId);
    expect(stored).toMatchObject({ serial: 'LB-01', code: result.code });
  });

  it('draws another code when the first one is taken', async () => {
    pairings.create.mockResolvedValueOnce(null);

    await useCase.execute({ serial: 'LB-01', ip: '10.0.0.1' });

    expect(pairings.create).toHaveBeenCalledTimes(2);
  });

  it('gives up with 503 when no free code turns up', async () => {
    pairings.create.mockResolvedValue(null);

    await expect(useCase.execute({ serial: 'LB-01', ip: '10.0.0.1' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('creates nothing past the IP limit', async () => {
    limiter.hitStart.mockRejectedValue(new HttpException('Too many', 429));

    await expect(useCase.execute({ serial: 'LB-01', ip: '10.0.0.1' })).rejects.toThrow('Too many');
    expect(pairings.create).not.toHaveBeenCalled();
  });
});
