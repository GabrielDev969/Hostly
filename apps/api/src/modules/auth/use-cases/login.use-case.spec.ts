import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { LoginUseCase } from './login.use-case';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { TokenService } from '../services/token.service';
import { CreateSessionUseCase } from '@modules/sessions/use-cases/create-session.use-case';
import { MetricsService } from '@shared/metrics/metrics.service';
import { AuditService } from '@modules/audit/services/audit.service';
import { CryptoUtil } from '@shared/utils/crypto.util';
import type { User } from '@modules/users/entities/user.entity';

describe('LoginUseCase', () => {
  let users: jest.Mocked<UsersRepository>;
  let tokens: jest.Mocked<TokenService>;
  let createSession: jest.Mocked<CreateSessionUseCase>;
  let metrics: jest.Mocked<MetricsService>;
  let audit: jest.Mocked<AuditService>;
  let useCase: LoginUseCase;

  const passwordHash = '$argon2id$mock';

  beforeEach(() => {
    users = {
      findByEmail: jest.fn(),
      findByEmailIncludingDeleted: jest.fn(),
      restore: jest.fn().mockResolvedValue(undefined),
      incrementFailedLoginAttempts: jest.fn().mockResolvedValue(1),
      lockAccount: jest.fn().mockResolvedValue(undefined),
      resetFailedLoginAttempts: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<UsersRepository>;
    tokens = {
      signAccessToken: jest.fn().mockResolvedValue('access-token'),
      signChallengeToken: jest.fn().mockResolvedValue('challenge-token'),
    } as unknown as jest.Mocked<TokenService>;
    createSession = {
      execute: jest.fn().mockResolvedValue({ id: 's1' }),
    } as unknown as jest.Mocked<CreateSessionUseCase>;
    metrics = {
      incLoginAttempt: jest.fn(),
    } as unknown as jest.Mocked<MetricsService>;
    audit = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;
    useCase = new LoginUseCase(users, tokens, createSession, metrics, audit);
  });

  it('rejects unknown email and counts as failure', async () => {
    users.findByEmailIncludingDeleted.mockResolvedValue(null);
    await expect(useCase.execute({ email: 'a@b.c', password: 'x' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(metrics.incLoginAttempt).toHaveBeenCalledWith('failure');
  });

  it('rejects users with no passwordHash (OAuth-only) as failure', async () => {
    users.findByEmailIncludingDeleted.mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      passwordHash: null,
    } as User);
    await expect(useCase.execute({ email: 'a@b.c', password: 'x' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(metrics.incLoginAttempt).toHaveBeenCalledWith('failure');
  });

  it('rejects bad password and counts as failure', async () => {
    users.findByEmailIncludingDeleted.mockResolvedValue({
      id: 'u1',
      passwordHash,
    } as User);
    jest.spyOn(CryptoUtil, 'verifyPassword').mockResolvedValueOnce(false);
    await expect(useCase.execute({ email: 'a@b.c', password: 'wrong' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(metrics.incLoginAttempt).toHaveBeenCalledWith('failure');
  });

  it('throws Forbidden when email is not verified', async () => {
    users.findByEmailIncludingDeleted.mockResolvedValue({
      id: 'u1',
      passwordHash,
      twoFactorEnabled: false,
      emailVerifiedAt: null,
    } as User);
    jest.spyOn(CryptoUtil, 'verifyPassword').mockResolvedValueOnce(true);
    await expect(useCase.execute({ email: 'a@b.c', password: 'right' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(metrics.incLoginAttempt).toHaveBeenCalledWith('failure');
  });

  it('returns 2FA challenge and counts as requires_2fa when twoFactorEnabled', async () => {
    users.findByEmailIncludingDeleted.mockResolvedValue({
      id: 'u1',
      passwordHash,
      twoFactorEnabled: true,
      emailVerifiedAt: new Date(),
    } as User);
    jest.spyOn(CryptoUtil, 'verifyPassword').mockResolvedValueOnce(true);
    const result = await useCase.execute({ email: 'a@b.c', password: 'right' });
    expect(result).toEqual({ requires2FA: true, challenge: 'challenge-token' });
    expect(metrics.incLoginAttempt).toHaveBeenCalledWith('requires_2fa');
  });

  it('issues tokens and counts as success on happy path', async () => {
    users.findByEmailIncludingDeleted.mockResolvedValue({
      id: 'u1',
      passwordHash,
      twoFactorEnabled: false,
      emailVerifiedAt: new Date(),
    } as User);
    jest.spyOn(CryptoUtil, 'verifyPassword').mockResolvedValueOnce(true);
    const result = await useCase.execute({
      email: 'a@b.c',
      password: 'right',
      userAgent: 'ua',
      ipAddress: '10.0.0.1',
    });
    if ('requires2FA' in result) throw new Error('expected tokens, got 2FA');
    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toMatch(/^[0-9a-f]{128}$/);
    expect(metrics.incLoginAttempt).toHaveBeenCalledWith('success');
    expect(createSession.execute).toHaveBeenCalledWith({
      userId: 'u1',
      refreshToken: result.refreshToken,
      userAgent: 'ua',
      ipAddress: '10.0.0.1',
    });
  });

  it('restores a soft-deleted user when credentials are correct, then issues tokens', async () => {
    users.findByEmailIncludingDeleted.mockResolvedValue({
      id: 'u1',
      passwordHash,
      twoFactorEnabled: false,
      emailVerifiedAt: new Date(),
      deletedAt: new Date(),
      anonymizedAt: null,
    } as User);
    jest.spyOn(CryptoUtil, 'verifyPassword').mockResolvedValueOnce(true);

    const result = await useCase.execute({
      email: 'a@b.c',
      password: 'right',
    });

    expect(users.restore).toHaveBeenCalledWith('u1');
    expect('accessToken' in result && result.accessToken).toBe('access-token');
    expect(metrics.incLoginAttempt).toHaveBeenCalledWith('success');
  });

  it('rejects with 423 Locked when account is currently locked', async () => {
    users.findByEmailIncludingDeleted.mockResolvedValue({
      id: 'u1',
      passwordHash,
      lockedUntil: new Date(Date.now() + 60_000),
    } as User);

    await expect(useCase.execute({ email: 'a@b.c', password: 'right' })).rejects.toMatchObject({
      status: 423,
    });

    expect(users.incrementFailedLoginAttempts).not.toHaveBeenCalled();
  });

  it('ignores expired lockedUntil and treats the user as unlocked', async () => {
    users.findByEmailIncludingDeleted.mockResolvedValue({
      id: 'u1',
      passwordHash,
      twoFactorEnabled: false,
      emailVerifiedAt: new Date(),
      lockedUntil: new Date(Date.now() - 60_000),
      failedLoginAttempts: 3,
    } as User);
    jest.spyOn(CryptoUtil, 'verifyPassword').mockResolvedValueOnce(true);

    await useCase.execute({ email: 'a@b.c', password: 'right' });

    expect(users.resetFailedLoginAttempts).toHaveBeenCalledWith('u1');
    expect(metrics.incLoginAttempt).toHaveBeenCalledWith('success');
  });

  it('increments failed attempts on invalid password and does not lock before the threshold', async () => {
    users.findByEmailIncludingDeleted.mockResolvedValue({
      id: 'u1',
      passwordHash,
      lockedUntil: null,
    } as User);
    users.incrementFailedLoginAttempts.mockResolvedValueOnce(2);
    jest.spyOn(CryptoUtil, 'verifyPassword').mockResolvedValueOnce(false);

    await expect(useCase.execute({ email: 'a@b.c', password: 'wrong' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(users.incrementFailedLoginAttempts).toHaveBeenCalledWith('u1');
    expect(users.lockAccount).not.toHaveBeenCalled();
  });

  it('locks the account when failed attempts reach the threshold (5)', async () => {
    users.findByEmailIncludingDeleted.mockResolvedValue({
      id: 'u1',
      passwordHash,
      lockedUntil: null,
    } as User);
    users.incrementFailedLoginAttempts.mockResolvedValueOnce(5);
    jest.spyOn(CryptoUtil, 'verifyPassword').mockResolvedValueOnce(false);

    await expect(useCase.execute({ email: 'a@b.c', password: 'wrong' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(users.lockAccount).toHaveBeenCalledWith('u1', expect.any(Date));
    const lockArg = users.lockAccount.mock.calls[0]![1];
    const delta = lockArg.getTime() - Date.now();
    // ~15min ±5s
    expect(delta).toBeGreaterThan(15 * 60 * 1000 - 5_000);
    expect(delta).toBeLessThanOrEqual(15 * 60 * 1000);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.account.locked' }),
    );
  });

  it('resets failed attempts on successful login', async () => {
    users.findByEmailIncludingDeleted.mockResolvedValue({
      id: 'u1',
      passwordHash,
      twoFactorEnabled: false,
      emailVerifiedAt: new Date(),
      failedLoginAttempts: 3,
      lockedUntil: null,
    } as User);
    jest.spyOn(CryptoUtil, 'verifyPassword').mockResolvedValueOnce(true);

    await useCase.execute({ email: 'a@b.c', password: 'right' });

    expect(users.resetFailedLoginAttempts).toHaveBeenCalledWith('u1');
  });

  it('does not call resetFailedLoginAttempts when the user has zero failures', async () => {
    users.findByEmailIncludingDeleted.mockResolvedValue({
      id: 'u1',
      passwordHash,
      twoFactorEnabled: false,
      emailVerifiedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    } as User);
    jest.spyOn(CryptoUtil, 'verifyPassword').mockResolvedValueOnce(true);

    await useCase.execute({ email: 'a@b.c', password: 'right' });

    expect(users.resetFailedLoginAttempts).not.toHaveBeenCalled();
  });

  it('does not call restore when the user is not soft-deleted', async () => {
    users.findByEmailIncludingDeleted.mockResolvedValue({
      id: 'u1',
      passwordHash,
      twoFactorEnabled: false,
      emailVerifiedAt: new Date(),
      deletedAt: null,
      anonymizedAt: null,
    } as User);
    jest.spyOn(CryptoUtil, 'verifyPassword').mockResolvedValueOnce(true);

    await useCase.execute({ email: 'a@b.c', password: 'right' });

    expect(users.restore).not.toHaveBeenCalled();
  });

  it('issueTokens persists session first, then signs access with that sessionId', async () => {
    const callOrder: string[] = [];
    createSession.execute.mockImplementation((input) => {
      callOrder.push('createSession');
      return Promise.resolve({
        id: 's1',
        userId: input.userId,
        refreshTokenHash: 'hash',
        userAgent: input.userAgent ?? null,
        ipAddress: input.ipAddress ?? null,
      }) as never;
    });
    tokens.signAccessToken.mockImplementation(() => {
      callOrder.push('signAccessToken');
      return Promise.resolve('access-token');
    });

    const result = await useCase.issueTokens('u1', 'ua', '10.0.0.1');

    expect(callOrder).toEqual(['createSession', 'signAccessToken']);
    expect(tokens.signAccessToken).toHaveBeenCalledWith({
      userId: 'u1',
      sessionId: 's1',
    });
    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toMatch(/^[0-9a-f]{128}$/);
    expect(createSession.execute).toHaveBeenCalledWith({
      userId: 'u1',
      refreshToken: result.refreshToken,
      userAgent: 'ua',
      ipAddress: '10.0.0.1',
    });
  });
});
