import { NotFoundException } from '@nestjs/common';
import { RequestEmailVerificationUseCase } from './request-email-verification.use-case';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { EmailVerifyTokensRepository } from '../repositories/email-verify-tokens.repository.interface';
import { EmailDispatcher } from '@shared/mailer/email-dispatcher.service';
import type { User } from '@modules/users/entities/user.entity';

describe('RequestEmailVerificationUseCase', () => {
  let users: jest.Mocked<UsersRepository>;
  let tokens: jest.Mocked<EmailVerifyTokensRepository>;
  let emailDispatcher: jest.Mocked<EmailDispatcher>;
  let useCase: RequestEmailVerificationUseCase;

  beforeEach(() => {
    users = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
    tokens = {
      create: jest.fn(),
      findByTokenHash: jest.fn(),
      markUsed: jest.fn(),
      deletePendingForUser: jest.fn().mockResolvedValue(undefined),
      deleteExpired: jest.fn(),
    };
    emailDispatcher = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EmailDispatcher>;
    useCase = new RequestEmailVerificationUseCase(users, tokens, emailDispatcher);
  });

  it('throws NotFound when user does not exist', async () => {
    users.findById.mockResolvedValue(null);
    await expect(useCase.execute('u1')).rejects.toBeInstanceOf(NotFoundException);
    expect(emailDispatcher.enqueue).not.toHaveBeenCalled();
  });

  it('returns silently when email is already verified', async () => {
    users.findById.mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      name: 'Jane',
      emailVerifiedAt: new Date(),
    } as User);
    await useCase.execute('u1');
    expect(emailDispatcher.enqueue).not.toHaveBeenCalled();
    expect(tokens.create).not.toHaveBeenCalled();
  });

  it('clears pending tokens, creates a new one and enqueues the email', async () => {
    users.findById.mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      name: 'Jane',
      emailVerifiedAt: null,
    } as User);
    await useCase.execute('u1');
    expect(tokens.deletePendingForUser).toHaveBeenCalledWith('u1');
    const createArg = tokens.create.mock.calls[0]![0];
    expect(createArg.userId).toBe('u1');
    expect(createArg.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    const ttlMs = createArg.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    expect(emailDispatcher.enqueue).toHaveBeenCalled();
    const emailArg = emailDispatcher.enqueue.mock.calls[0]![0];
    expect(emailArg.to).toBe('a@b.c');
    expect(emailArg.subject).toContain('email');
  });
});
