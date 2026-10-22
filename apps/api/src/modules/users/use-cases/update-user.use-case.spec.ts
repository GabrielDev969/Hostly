import { ConflictException, NotFoundException } from '@nestjs/common';
import { UpdateUserUseCase } from './update-user.use-case';
import { UsersRepository } from '../repositories/users.repository.interface';
import { User } from '../entities/user.entity';

describe('UpdateUserUseCase', () => {
  let users: jest.Mocked<UsersRepository>;
  let useCase: UpdateUserUseCase;

  const baseUser = (overrides: Partial<User> = {}): User => ({
    id: 'u1',
    email: 'jane@example.com',
    name: 'Jane',
    passwordHash: 'h',
    twoFactorEnabled: false,
    twoFactorSecret: null,
    recoveryCodes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    emailVerifiedAt: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    tokensInvalidatedAt: null,
    anonymizedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    users = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdInWorkspace: jest.fn(),
      findByEmail: jest.fn(),
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
    useCase = new UpdateUserUseCase(users);
  });

  it('updates name without checking email conflict when email is unchanged', async () => {
    users.findByIdInWorkspace.mockResolvedValue(baseUser());
    users.update.mockResolvedValue(baseUser({ name: 'Jane Doe' }));

    await useCase.execute({
      id: 'u1',
      workspaceId: 'w1',
      name: 'Jane Doe',
    });

    expect(users.findByEmail).not.toHaveBeenCalled();
    expect(users.update).toHaveBeenCalledWith('u1', {
      email: undefined,
      name: 'Jane Doe',
    });
  });

  it('allows email change when no other user owns the new email', async () => {
    users.findByIdInWorkspace.mockResolvedValue(baseUser());
    users.findByEmail.mockResolvedValue(null);
    users.update.mockResolvedValue(baseUser({ email: 'new@example.com' }));

    await useCase.execute({
      id: 'u1',
      workspaceId: 'w1',
      email: 'new@example.com',
    });

    expect(users.update).toHaveBeenCalled();
  });

  it('throws 404 when user is not in the workspace', async () => {
    users.findByIdInWorkspace.mockResolvedValue(null);

    await expect(
      useCase.execute({ id: 'u1', workspaceId: 'w1', name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws 409 when new email belongs to a different user', async () => {
    users.findByIdInWorkspace.mockResolvedValue(baseUser());
    users.findByEmail.mockResolvedValue(baseUser({ id: 'u2' }));

    await expect(
      useCase.execute({
        id: 'u1',
        workspaceId: 'w1',
        email: 'taken@example.com',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(users.update).not.toHaveBeenCalled();
  });
});
