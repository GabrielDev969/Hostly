import { BadRequestException } from '@nestjs/common';
import { VerifyEmailUseCase } from './verify-email.use-case';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { EmailVerifyTokensRepository } from '../repositories/email-verify-tokens.repository.interface';
import { CryptoUtil } from '@shared/utils/crypto.util';

describe('VerifyEmailUseCase', () => {
  let users: jest.Mocked<UsersRepository>;
  let tokens: jest.Mocked<EmailVerifyTokensRepository>;
  let useCase: VerifyEmailUseCase;

  beforeEach(() => {
    users = {
      update: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
    tokens = {
      findByTokenHash: jest.fn(),
      markUsed: jest.fn(),
    } as unknown as jest.Mocked<EmailVerifyTokensRepository>;
    useCase = new VerifyEmailUseCase(users, tokens);
  });

  it('throws BadRequest when token is unknown', async () => {
    tokens.findByTokenHash.mockResolvedValue(null);
    await expect(useCase.execute('bad')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequest when token has been used', async () => {
    tokens.findByTokenHash.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      tokenHash: 'h',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(),
      createdAt: new Date(),
    });
    await expect(useCase.execute('used')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequest when token is expired', async () => {
    tokens.findByTokenHash.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      tokenHash: 'h',
      expiresAt: new Date(Date.now() - 1_000),
      usedAt: null,
      createdAt: new Date(),
    });
    await expect(useCase.execute('old')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('verifies user and marks token used on happy path', async () => {
    tokens.findByTokenHash.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      tokenHash: CryptoUtil.hashToken('raw'),
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      createdAt: new Date(),
    });
    await useCase.execute('raw');
    expect(users.update).toHaveBeenCalledWith('u1', {
      emailVerifiedAt: expect.any(Date),
    });
    expect(tokens.markUsed).toHaveBeenCalledWith('t1');
  });
});
