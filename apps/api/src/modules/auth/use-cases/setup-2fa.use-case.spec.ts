import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { SetupTwoFactorUseCase } from './setup-2fa.use-case';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { TwoFactorService } from '../services/two-factor.service';
import { AuditService } from '@modules/audit/services/audit.service';
import { CryptoUtil } from '@shared/utils/crypto.util';
import type { User } from '@modules/users/entities/user.entity';

describe('SetupTwoFactorUseCase', () => {
  let users: jest.Mocked<UsersRepository>;
  let twoFactor: jest.Mocked<TwoFactorService>;
  let audit: jest.Mocked<AuditService>;
  let useCase: SetupTwoFactorUseCase;
  let passwordHash: string;

  const baseUser = (overrides: Partial<User> = {}): User =>
    ({
      id: 'u1',
      email: 'jane@example.com',
      name: 'Jane',
      passwordHash,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      recoveryCodes: null,
      ...overrides,
    }) as User;

  beforeAll(async () => {
    passwordHash = await CryptoUtil.hashPassword('CorrectPass@123');
  });

  beforeEach(() => {
    users = {
      findById: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
    twoFactor = {
      generateSecret: jest.fn().mockReturnValue('SECRET'),
      encryptSecret: jest.fn().mockReturnValue('encrypted-secret'),
      buildOtpAuthUrl: jest.fn().mockReturnValue('otpauth://...'),
    } as unknown as jest.Mocked<TwoFactorService>;
    audit = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;
    useCase = new SetupTwoFactorUseCase(users, twoFactor, audit);
  });

  it('throws NotFoundException when the user does not exist', async () => {
    users.findById.mockResolvedValue(null);
    await expect(useCase.execute('u1', 'CorrectPass@123')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws BadRequestException when 2FA is already enabled', async () => {
    users.findById.mockResolvedValue(baseUser({ twoFactorEnabled: true }));
    await expect(useCase.execute('u1', 'CorrectPass@123')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws UnauthorizedException when password is wrong', async () => {
    users.findById.mockResolvedValue(baseUser());
    await expect(useCase.execute('u1', 'WrongPass@123')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(users.update).not.toHaveBeenCalled();
    expect(twoFactor.generateSecret).not.toHaveBeenCalled();
  });

  it('generates an encrypted secret and returns the otpauth url', async () => {
    users.findById.mockResolvedValue(baseUser());

    const result = await useCase.execute('u1', 'CorrectPass@123');

    expect(twoFactor.generateSecret).toHaveBeenCalled();
    expect(twoFactor.encryptSecret).toHaveBeenCalledWith('SECRET');
    expect(users.update).toHaveBeenCalledWith('u1', {
      twoFactorSecret: 'encrypted-secret',
    });
    expect(twoFactor.buildOtpAuthUrl).toHaveBeenCalledWith('jane@example.com', 'SECRET');
    expect(result).toEqual({ secret: 'SECRET', otpauthUrl: 'otpauth://...' });
  });
});
