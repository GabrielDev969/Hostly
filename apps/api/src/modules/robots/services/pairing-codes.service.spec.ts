import { HttpException, NotFoundException } from '@nestjs/common';
import { PairingCodesService } from './pairing-codes.service';
import { PairingRateLimiter } from './pairing-rate-limiter.service';
import { RobotPairingsRepository } from '../repositories/robot-pairings.repository.interface';

describe('PairingCodesService', () => {
  let pairings: jest.Mocked<RobotPairingsRepository>;
  let limiter: jest.Mocked<Pick<PairingRateLimiter, 'reserveCodeAttempt' | 'refundCodeAttempt'>>;
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
    limiter = { reserveCodeAttempt: jest.fn(), refundCodeAttempt: jest.fn() };
    service = new PairingCodesService(pairings, limiter as unknown as PairingRateLimiter);
  });

  it('reserves an attempt before the lookup and gives it back for a right code', async () => {
    await expect(service.findPending('u1', '123456')).resolves.toMatchObject({ id: 'p1' });
    expect(limiter.reserveCodeAttempt).toHaveBeenCalledWith('u1');
    expect(limiter.refundCodeAttempt).toHaveBeenCalledWith('u1');
  });

  it('counts a wrong or expired code against the user and answers 404', async () => {
    pairings.findPendingByCode.mockResolvedValue(null);

    await expect(service.findPending('u1', '123456')).rejects.toThrow(
      new NotFoundException('Pairing code not found or expired'),
    );
    expect(limiter.reserveCodeAttempt).toHaveBeenCalledWith('u1');
    expect(limiter.refundCodeAttempt).not.toHaveBeenCalled();
  });

  it('refuses a blocked user even with the right code', async () => {
    limiter.reserveCodeAttempt.mockRejectedValue(new HttpException('Too many', 429));

    await expect(service.findPending('u1', '123456')).rejects.toThrow('Too many');
    expect(pairings.findPendingByCode).not.toHaveBeenCalled();
  });
});
