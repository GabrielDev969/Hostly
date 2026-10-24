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
  const nowMs = Date.now();

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
        iatMs: nowMs,
      }),
    ).toEqual({
      id: 'u1',
      sessionId: 's1',
    });
    expect(sessions.findById).toHaveBeenCalledWith('s1');
  });

  it('rejects a 2FA challenge token used as an access token', async () => {
    await expect(
      strategy.validate({ sub: 'u1', type: '2fa-challenge', iatMs: nowMs }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.findById).not.toHaveBeenCalled();
  });

  it('rejects when session does not exist', async () => {
    sessions.findById.mockResolvedValue(null);
    await expect(
      strategy.validate({
        sub: 'u1',
        sessionId: 's-missing',
        iatMs: nowMs,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when session is revoked', async () => {
    sessions.findById.mockResolvedValue(baseSession({ revokedAt: new Date() }));
    await expect(
      strategy.validate({ sub: 'u1', sessionId: 's1', iatMs: nowMs }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when session is expired', async () => {
    sessions.findById.mockResolvedValue(baseSession({ expiresAt: new Date(Date.now() - 60_000) }));
    await expect(
      strategy.validate({ sub: 'u1', sessionId: 's1', iatMs: nowMs }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  // iat has whole seconds; these tokens and the invalidation share the second 1_800_000_000.
  const second = 1_800_000_000_000;
  const invalidatedAt = new Date(second + 500);

  it('rejects a token issued earlier in the same second as the invalidation', async () => {
    sessions.findById.mockResolvedValue(baseSession());
    users.findTokensInvalidatedAt.mockResolvedValue(invalidatedAt);
    await expect(
      strategy.validate({ sub: 'u1', sessionId: 's1', iatMs: second + 400 }),
    ).rejects.toThrow(new UnauthorizedException('Token has been invalidated'));
  });

  it('rejects a token issued in the same millisecond as the invalidation', async () => {
    sessions.findById.mockResolvedValue(baseSession());
    users.findTokensInvalidatedAt.mockResolvedValue(invalidatedAt);
    await expect(
      strategy.validate({ sub: 'u1', sessionId: 's1', iatMs: second + 500 }),
    ).rejects.toThrow(new UnauthorizedException('Token has been invalidated'));
  });

  it('accepts a token issued later in the same second as the invalidation', async () => {
    sessions.findById.mockResolvedValue(baseSession());
    users.findTokensInvalidatedAt.mockResolvedValue(invalidatedAt);
    await expect(
      strategy.validate({ sub: 'u1', sessionId: 's1', iatMs: second + 600 }),
    ).resolves.toEqual({ id: 'u1', sessionId: 's1' });
  });

  it('rejects a token issued seconds before the invalidation', async () => {
    sessions.findById.mockResolvedValue(baseSession());
    users.findTokensInvalidatedAt.mockResolvedValue(new Date(nowMs + 5_000));
    await expect(
      strategy.validate({ sub: 'u1', sessionId: 's1', iatMs: nowMs }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a token issued seconds after the invalidation', async () => {
    sessions.findById.mockResolvedValue(baseSession());
    users.findTokensInvalidatedAt.mockResolvedValue(new Date(nowMs - 5_000));
    await expect(strategy.validate({ sub: 'u1', sessionId: 's1', iatMs: nowMs })).resolves.toEqual({
      id: 'u1',
      sessionId: 's1',
    });
  });

  it.each([
    ['ISO text', new Date(nowMs - 5_000).toISOString()],
    ['an invalid Date', new Date(NaN)],
  ])('fails closed with 401 when tokensInvalidatedAt comes back as %s', async (_label, value) => {
    sessions.findById.mockResolvedValue(baseSession());
    users.findTokensInvalidatedAt.mockResolvedValue(value as unknown as Date);
    await expect(strategy.validate({ sub: 'u1', sessionId: 's1', iatMs: nowMs })).rejects.toThrow(
      new UnauthorizedException('Token has been invalidated'),
    );
  });

  it('rejects an access token without the millisecond issue time', async () => {
    await expect(strategy.validate({ sub: 'u1', sessionId: 's1' })).rejects.toThrow(
      new UnauthorizedException('Invalid access token'),
    );
    expect(sessions.findById).not.toHaveBeenCalled();
  });

  it('accepts when tokensInvalidatedAt is null', async () => {
    sessions.findById.mockResolvedValue(baseSession());
    users.findTokensInvalidatedAt.mockResolvedValue(null);
    await expect(strategy.validate({ sub: 'u1', sessionId: 's1', iatMs: nowMs })).resolves.toEqual({
      id: 'u1',
      sessionId: 's1',
    });
  });
});
