import { HttpException, NotFoundException } from '@nestjs/common';
import { PairingCodesService } from './pairing-codes.service';
import { PairingRateLimiter } from './pairing-rate-limiter.service';
import { RobotPairingsRepository } from '../repositories/robot-pairings.repository.interface';

describe('PairingCodesService', () => {
  let pairings: jest.Mocked<RobotPairingsRepository>;
  let limiter: jest.Mocked<Pick<PairingRateLimiter, 'assertCodeAttemptsLeft' | 'recordWrongCode'>>;
  let service: PairingCodesService;

  beforeEach(() => {
    pairings = {
      deleteExpired: jest.fn(),
      create: jest.fn(),
      findPendingByCode: jest.fn().mockResolvedValue({ id: 'p1' }),
      findByPollKeyHash: jest.fn(),
      approve: jest.fn(),
      claimApproved: jest.fn(),
    };
    limiter = { assertCodeAttemptsLeft: jest.fn(), recordWrongCode: jest.fn() };
    service = new PairingCodesService(pairings, limiter as unknown as PairingRateLimiter);
  });

  it('returns the pending pairing without counting a miss', async () => {
    await expect(service.findPending('u1', '123456')).resolves.toMatchObject({ id: 'p1' });
    expect(limiter.recordWrongCode).not.toHaveBeenCalled();
  });

  it('counts a wrong or expired code against the user and answers 404', async () => {
    pairings.findPendingByCode.mockResolvedValue(null);

    await expect(service.findPending('u1', '123456')).rejects.toThrow(
      new NotFoundException('Pairing code not found or expired'),
    );
    expect(limiter.recordWrongCode).toHaveBeenCalledWith('u1');
  });

  it('refuses a blocked user even with the right code', async () => {
    limiter.assertCodeAttemptsLeft.mockRejectedValue(new HttpException('Too many', 429));

    await expect(service.findPending('u1', '123456')).rejects.toThrow('Too many');
    expect(pairings.findPendingByCode).not.toHaveBeenCalled();
  });
});
