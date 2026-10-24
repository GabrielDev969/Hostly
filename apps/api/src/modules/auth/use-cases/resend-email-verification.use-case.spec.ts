import { HttpException, HttpStatus } from '@nestjs/common';
import { ResendEmailVerificationUseCase } from './resend-email-verification.use-case';
import { EmailVerificationRateLimiter } from '../services/email-verification-rate-limiter.service';
import { EmailVerificationQueue } from '../services/email-verification-queue.service';

describe('ResendEmailVerificationUseCase', () => {
  let limiter: jest.Mocked<EmailVerificationRateLimiter>;
  let queue: jest.Mocked<EmailVerificationQueue>;
  let useCase: ResendEmailVerificationUseCase;

  beforeEach(() => {
    limiter = {
      hitResend: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EmailVerificationRateLimiter>;
    queue = {
      enqueueResend: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EmailVerificationQueue>;
    useCase = new ResendEmailVerificationUseCase(limiter, queue);
  });

  it('never looks the user up on the request path', () => {
    // Only the limiter and the queue: the response cannot depend on whether the account exists.
    expect(ResendEmailVerificationUseCase.length).toBe(2);
  });

  it('counts the request, then queues only the email', async () => {
    await useCase.execute({ email: 'a@b.c', ip: '10.0.0.1' });

    expect(limiter.hitResend).toHaveBeenCalledWith('10.0.0.1', 'a@b.c');
    expect(queue.enqueueResend).toHaveBeenCalledWith('a@b.c');
    expect(limiter.hitResend.mock.invocationCallOrder[0]).toBeLessThan(
      queue.enqueueResend.mock.invocationCallOrder[0]!,
    );
  });

  it('queues nothing when the limiter refuses', async () => {
    limiter.hitResend.mockRejectedValue(
      new HttpException('Too many requests; try again later', HttpStatus.TOO_MANY_REQUESTS),
    );

    await expect(useCase.execute({ email: 'a@b.c', ip: '10.0.0.1' })).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(queue.enqueueResend).not.toHaveBeenCalled();
  });
});
