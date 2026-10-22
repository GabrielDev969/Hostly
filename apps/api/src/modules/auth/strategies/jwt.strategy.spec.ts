import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { JwtKeyResolverService } from '../services/jwt-key-resolver.service';
import { SessionsRepository } from '@modules/sessions/repositories/sessions.repository.interface';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { Session } from '@modules/sessions/entities/session.entity';

const baseSession = (overrides: Partial<Session> = {}): Session => ({
  id: 's1',
  userId: 'u1',
  refreshTokenHash: 'h',
  userAgent: null,
  ipAddress: null,
  expiresAt: new Date(Date.now() + 60_000),
  revokedAt: null,
  lastUsedAt: new Date(),
  createdAt: new Date(),
  ...overrides,
});

describe('JwtStrategy', () => {
  let sessions: jest.Mocked<SessionsRepository>;
  let users: jest.Mocked<UsersRepository>;
  let strategy: JwtStrategy;
  const resolver = new JwtKeyResolverService();
  const nowSeconds = Math.floor(Date.now() / 1000);

  beforeEach(() => {
    sessions = {
      create: jest.fn(),
      findById: jest.fn(),
      findByTokenHash: jest.fn(),
      findActiveByUser: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
      deleteExpired: jest.fn(),
    };
    users = {
      findTokensInvalidatedAt: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<UsersRepository>;
    strategy = new JwtStrategy(sessions, users, resolver);
  });

  it('maps sub to id and forwards sessionId when session is active', async () => {
    sessions.findById.mockResolvedValue(baseSession());
    expect(
      await strategy.validate({
        sub: 'u1',
        sessionId: 's1',
        iat: nowSeconds,
      }),
    ).toEqual({
      id: 'u1',
      sessionId: 's1',
    });
    expect(sessions.findById).toHaveBeenCalledWith('s1');
  });

  it('rejects a 2FA challenge token used as an access token', async () => {
    await expect(
      strategy.validate({ sub: 'u1', type: '2fa-challenge', iat: nowSeconds }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.findById).not.toHaveBeenCalled();
  });

  it('rejects when session does not exist', async () => {
    sessions.findById.mockResolvedValue(null);
    await expect(
      strategy.validate({
        sub: 'u1',
        sessionId: 's-missing',
        iat: nowSeconds,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when session is revoked', async () => {
    sessions.findById.mockResolvedValue(baseSession({ revokedAt: new Date() }));
    await expect(
      strategy.validate({ sub: 'u1', sessionId: 's1', iat: nowSeconds }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when session is expired', async () => {
    sessions.findById.mockResolvedValue(baseSession({ expiresAt: new Date(Date.now() - 60_000) }));
    await expect(
      strategy.validate({ sub: 'u1', sessionId: 's1', iat: nowSeconds }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when tokensInvalidatedAt is newer than the token iat', async () => {
    sessions.findById.mockResolvedValue(baseSession());
    users.findTokensInvalidatedAt.mockResolvedValue(new Date((nowSeconds + 5) * 1000));
    await expect(
      strategy.validate({ sub: 'u1', sessionId: 's1', iat: nowSeconds }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts when tokensInvalidatedAt is older than the token iat', async () => {
    sessions.findById.mockResolvedValue(baseSession());
    users.findTokensInvalidatedAt.mockResolvedValue(new Date((nowSeconds - 5) * 1000));
    await expect(
      strategy.validate({ sub: 'u1', sessionId: 's1', iat: nowSeconds }),
    ).resolves.toEqual({ id: 'u1', sessionId: 's1' });
  });

  it('accepts when tokensInvalidatedAt is null', async () => {
    sessions.findById.mockResolvedValue(baseSession());
    users.findTokensInvalidatedAt.mockResolvedValue(null);
    await expect(
      strategy.validate({ sub: 'u1', sessionId: 's1', iat: nowSeconds }),
    ).resolves.toEqual({ id: 'u1', sessionId: 's1' });
  });
});
