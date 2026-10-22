import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DisableTwoFactorUseCase } from './disable-2fa.use-case';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { TwoFactorService } from '../services/two-factor.service';
import { AuditService } from '@modules/audit/services/audit.service';
import { CryptoUtil } from '@shared/utils/crypto.util';
import { User } from '@modules/users/entities/user.entity';

describe('DisableTwoFactorUseCase', () => {
  let users: jest.Mocked<UsersRepository>;
  let twoFactor: jest.Mocked<TwoFactorService>;
  let audit: jest.Mocked<AuditService>;
  let useCase: DisableTwoFactorUseCase;
  let passwordHash: string;

  const userWithTfa = (overrides: Partial<User> = {}): User => ({
    id: 'u1',
    email: 'jane@example.com',
    name: 'Jane',
    passwordHash,
    twoFactorEnabled: true,
    twoFactorSecret: 'encrypted-secret',
    recoveryCodes: '[]',
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

  beforeAll(async () => {
    passwordHash = await CryptoUtil.hashPassword('CorrectPass@123');
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
    twoFactor = {
      generateSecret: jest.fn(),
      buildOtpAuthUrl: jest.fn(),
      verifyToken: jest.fn(),
      generateToken: jest.fn(),
      encryptSecret: jest.fn(),
      decryptSecret: jest.fn().mockReturnValue('plain-secret'),
      generateRecoveryCodes: jest.fn(),
      hashRecoveryCodes: jest.fn(),
      consumeRecoveryCode: jest.fn(),
    };
    audit = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;
    useCase = new DisableTwoFactorUseCase(users, twoFactor, audit);
  });

  it('clears 2FA fields when password and TOTP are valid', async () => {
    users.findById.mockResolvedValue(userWithTfa());
    twoFactor.verifyToken.mockReturnValue(true);

    await useCase.execute('u1', 'CorrectPass@123', '123456');

    expect(users.update).toHaveBeenCalledWith('u1', {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      recoveryCodes: null,
    });
  });

  it('throws 404 when user is not found', async () => {
    users.findById.mockResolvedValue(null);

    await expect(useCase.execute('missing', 'pwd', '123456')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws 400 when 2FA is not enabled', async () => {
    users.findById.mockResolvedValue(
      userWithTfa({
        twoFactorEnabled: false,
        twoFactorSecret: null,
      }),
    );

    await expect(useCase.execute('u1', 'CorrectPass@123', '123456')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws 401 when password is wrong', async () => {
    users.findById.mockResolvedValue(userWithTfa());

    await expect(useCase.execute('u1', 'WrongPass@123', '123456')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(users.update).not.toHaveBeenCalled();
  });

  it('throws 401 when TOTP code is wrong', async () => {
    users.findById.mockResolvedValue(userWithTfa());
    twoFactor.verifyToken.mockReturnValue(false);

    await expect(useCase.execute('u1', 'CorrectPass@123', '000000')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(users.update).not.toHaveBeenCalled();
  });
});
