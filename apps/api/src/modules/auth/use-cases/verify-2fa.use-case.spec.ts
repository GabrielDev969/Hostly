import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { VerifyTwoFactorUseCase } from './verify-2fa.use-case';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { TokenService } from '../services/token.service';
import { TwoFactorService } from '../services/two-factor.service';
import { LoginUseCase } from './login.use-case';
import { MetricsService } from '@shared/metrics/metrics.service';
import { AuditService } from '@modules/audit/services/audit.service';
import type { User } from '@modules/users/entities/user.entity';

describe('VerifyTwoFactorUseCase', () => {
  let users: jest.Mocked<UsersRepository>;
  let tokens: jest.Mocked<TokenService>;
  let twoFactor: jest.Mocked<TwoFactorService>;
  let loginUseCase: jest.Mocked<LoginUseCase>;
  let metrics: jest.Mocked<MetricsService>;
  let audit: jest.Mocked<AuditService>;
  let useCase: VerifyTwoFactorUseCase;

  beforeEach(() => {
    users = {
      findById: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
    tokens = {
      verifyChallengeToken: jest.fn(),
    } as unknown as jest.Mocked<TokenService>;
    twoFactor = {
      decryptSecret: jest.fn().mockReturnValue('SECRET'),
      verifyToken: jest.fn(),
      consumeRecoveryCode: jest.fn(),
    } as unknown as jest.Mocked<TwoFactorService>;
    loginUseCase = {
      issueTokens: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
    } as unknown as jest.Mocked<LoginUseCase>;
    metrics = {
      incTwoFactorVerify: jest.fn(),
    } as unknown as jest.Mocked<MetricsService>;
    audit = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;
    useCase = new VerifyTwoFactorUseCase(users, tokens, twoFactor, loginUseCase, metrics, audit);
  });

  it('throws Unauthorized when challenge cannot be verified', async () => {
    tokens.verifyChallengeToken.mockRejectedValue(new Error('jwt expired'));
    await expect(useCase.execute({ challenge: 'bad', code: '123456' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(metrics.incTwoFactorVerify).toHaveBeenCalledWith('invalid_challenge');
  });

  it('throws BadRequest when 2FA is not enabled for the user', async () => {
    tokens.verifyChallengeToken.mockResolvedValue('u1');
    users.findById.mockResolvedValue({
      id: 'u1',
      twoFactorEnabled: false,
      twoFactorSecret: null,
    } as User);
    await expect(useCase.execute({ challenge: 'ch', code: '123456' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws Unauthorized when both TOTP and recovery code fail', async () => {
    tokens.verifyChallengeToken.mockResolvedValue('u1');
    users.findById.mockResolvedValue({
      id: 'u1',
      twoFactorEnabled: true,
      twoFactorSecret: 'enc',
      recoveryCodes: '[]',
    } as User);
    twoFactor.verifyToken.mockReturnValue(false);
    twoFactor.consumeRecoveryCode.mockReturnValue(null);
    await expect(useCase.execute({ challenge: 'ch', code: 'wrong' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(metrics.incTwoFactorVerify).toHaveBeenCalledWith('invalid_code');
  });

  it('issues tokens on valid TOTP', async () => {
    tokens.verifyChallengeToken.mockResolvedValue('u1');
    users.findById.mockResolvedValue({
      id: 'u1',
      twoFactorEnabled: true,
      twoFactorSecret: 'enc',
      recoveryCodes: '[]',
    } as User);
    twoFactor.verifyToken.mockReturnValue(true);
    const result = await useCase.execute({
      challenge: 'ch',
      code: '123456',
      userAgent: 'ua',
      ipAddress: '10.0.0.1',
    });
    expect(loginUseCase.issueTokens).toHaveBeenCalledWith('u1', 'ua', '10.0.0.1');
    expect(result).toEqual({ accessToken: 'a', refreshToken: 'r' });
    expect(metrics.incTwoFactorVerify).toHaveBeenCalledWith('success');
  });

  it('falls back to recovery code, persists remaining list, and issues tokens', async () => {
    tokens.verifyChallengeToken.mockResolvedValue('u1');
    users.findById.mockResolvedValue({
      id: 'u1',
      twoFactorEnabled: true,
      twoFactorSecret: 'enc',
      recoveryCodes: '["a","b"]',
    } as User);
    twoFactor.verifyToken.mockReturnValue(false);
    twoFactor.consumeRecoveryCode.mockReturnValue('["b"]');
    await useCase.execute({ challenge: 'ch', code: 'recovery' });
    expect(users.update).toHaveBeenCalledWith('u1', {
      recoveryCodes: '["b"]',
    });
    expect(metrics.incTwoFactorVerify).toHaveBeenCalledWith('success');
  });
});
