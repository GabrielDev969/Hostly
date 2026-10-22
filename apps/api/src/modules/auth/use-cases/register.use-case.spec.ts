import { ConflictException } from '@nestjs/common';
import { RegisterUseCase } from './register.use-case';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { CryptoUtil } from '@shared/utils/crypto.util';
import { User } from '@modules/users/entities/user.entity';
import { MetricsService } from '@shared/metrics/metrics.service';
import { RequestEmailVerificationUseCase } from './request-email-verification.use-case';

describe('RegisterUseCase', () => {
  let users: jest.Mocked<UsersRepository>;
  let metrics: jest.Mocked<MetricsService>;
  let requestEmailVerification: jest.Mocked<RequestEmailVerificationUseCase>;
  let useCase: RegisterUseCase;

  beforeEach(() => {
    users = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      findByIdInWorkspace: jest.fn(),
      findManyByWorkspace: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      anonymize: jest.fn(),
      findByEmailIncludingDeleted: jest.fn(),
      findPendingAnonymization: jest.fn(),
      incrementFailedLoginAttempts: jest.fn(),
      lockAccount: jest.fn(),
      resetFailedLoginAttempts: jest.fn(),
      findTokensInvalidatedAt: jest.fn(),
      invalidateTokens: jest.fn(),
    };
    metrics = {
      incRegister: jest.fn(),
    } as unknown as jest.Mocked<MetricsService>;
    requestEmailVerification = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RequestEmailVerificationUseCase>;
    useCase = new RegisterUseCase(users, metrics, requestEmailVerification);
  });

  it('creates a user and hashes the password without provisioning any tenant', async () => {
    users.findByEmail.mockResolvedValue(null);
    users.create.mockResolvedValue({
      id: 'u1',
      email: 'jane@example.com',
      name: 'Jane',
    } as User);

    const result = await useCase.execute({
      email: 'jane@example.com',
      name: 'Jane',
      password: 'StrongPass@123',
    });

    expect(result).toEqual({
      id: 'u1',
      email: 'jane@example.com',
      name: 'Jane',
    });

    const createArg = users.create.mock.calls[0]![0];
    expect(createArg.email).toBe('jane@example.com');
    expect(createArg.name).toBe('Jane');
    expect(createArg.passwordHash).toBeDefined();
    expect(createArg.passwordHash).not.toBe('StrongPass@123');
    await expect(
      CryptoUtil.verifyPassword(createArg.passwordHash!, 'StrongPass@123'),
    ).resolves.toBe(true);

    expect(requestEmailVerification.execute).toHaveBeenCalledWith('u1');
  });

  it('throws ConflictException if the email already exists', async () => {
    users.findByEmail.mockResolvedValue({ id: 'u1' } as User);

    await expect(
      useCase.execute({
        email: 'taken@example.com',
        name: 'X',
        password: 'StrongPass@123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(users.create).not.toHaveBeenCalled();
  });
});
