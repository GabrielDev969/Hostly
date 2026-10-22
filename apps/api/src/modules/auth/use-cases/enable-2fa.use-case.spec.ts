import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { EnableTwoFactorUseCase } from './enable-2fa.use-case';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { TwoFactorService } from '../services/two-factor.service';
import { MetricsService } from '@shared/metrics/metrics.service';
import { AuditService } from '@modules/audit/services/audit.service';
import { CryptoUtil } from '@shared/utils/crypto.util';
import type { User } from '@modules/users/entities/user.entity';

describe('EnableTwoFactorUseCase', () => {
  let users: jest.Mocked<UsersRepository>;
  let twoFactor: jest.Mocked<TwoFactorService>;
  let metrics: jest.Mocked<MetricsService>;
  let audit: jest.Mocked<AuditService>;
  let useCase: EnableTwoFactorUseCase;
  let passwordHash: string;

  const userWithSecret = (overrides: Partial<User> = {}): User =>
    ({
      id: 'u1',
      email: 'jane@example.com',
      name: 'Jane',
      passwordHash,
      twoFactorEnabled: false,
      twoFactorSecret: 'encrypted-secret',
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
      decryptSecret: jest.fn().mockReturnValue('plain-secret'),
      verifyToken: jest.fn(),
      generateRecoveryCodes: jest.fn().mockReturnValue(['code-1', 'code-2', 'code-3']),
      hashRecoveryCodes: jest.fn().mockReturnValue('["hashed"]'),
    } as unknown as jest.Mocked<TwoFactorService>;
    metrics = {
      incTwoFactorEnable: jest.fn(),
    } as unknown as jest.Mocked<MetricsService>;
    audit = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;
    useCase = new EnableTwoFactorUseCase(users, twoFactor, metrics, audit);
  });

  it('throws NotFoundException when user is missing', async () => {
    users.findById.mockResolvedValue(null);

    await expect(useCase.execute('missing', 'CorrectPass@123', '123456')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(metrics.incTwoFactorEnable).toHaveBeenCalledWith('not_found');
  });

  it('throws BadRequestException when 2FA is already enabled', async () => {
    users.findById.mockResolvedValue(userWithSecret({ twoFactorEnabled: true }));

    await expect(useCase.execute('u1', 'CorrectPass@123', '123456')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws BadRequestException when setup has not run yet', async () => {
    users.findById.mockResolvedValue(userWithSecret({ twoFactorSecret: null }));

    await expect(useCase.execute('u1', 'CorrectPass@123', '123456')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws UnauthorizedException when password is wrong', async () => {
    users.findById.mockResolvedValue(userWithSecret());

    await expect(useCase.execute('u1', 'WrongPass@123', '123456')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(metrics.incTwoFactorEnable).toHaveBeenCalledWith('invalid_password');
    expect(twoFactor.verifyToken).not.toHaveBeenCalled();
    expect(users.update).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when TOTP is wrong', async () => {
    users.findById.mockResolvedValue(userWithSecret());
    twoFactor.verifyToken.mockReturnValue(false);

    await expect(useCase.execute('u1', 'CorrectPass@123', '000000')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(metrics.incTwoFactorEnable).toHaveBeenCalledWith('invalid_code');
    expect(users.update).not.toHaveBeenCalled();
  });

  it('enables 2FA and returns recovery codes when password and TOTP are valid', async () => {
    users.findById.mockResolvedValue(userWithSecret());
    twoFactor.verifyToken.mockReturnValue(true);

    const result = await useCase.execute('u1', 'CorrectPass@123', '123456');

    expect(users.update).toHaveBeenCalledWith('u1', {
      twoFactorEnabled: true,
      recoveryCodes: '["hashed"]',
    });
    expect(metrics.incTwoFactorEnable).toHaveBeenCalledWith('success');
    expect(result).toEqual({ recoveryCodes: ['code-1', 'code-2', 'code-3'] });
  });
});
