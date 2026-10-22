import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RevokeSessionUseCase } from './revoke-session.use-case';
import { SessionsRepository } from '../repositories/sessions.repository.interface';
import { Session } from '../entities/session.entity';

describe('RevokeSessionUseCase', () => {
  let sessions: jest.Mocked<SessionsRepository>;
  let useCase: RevokeSessionUseCase;

  const baseSession = (overrides: Partial<Session> = {}): Session => ({
    id: 's1',
    userId: 'u1',
    refreshTokenHash: 'hash',
    userAgent: null,
    ipAddress: null,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    lastUsedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  });

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
    useCase = new RevokeSessionUseCase(sessions);
  });

  it('revokes the session when the user owns it', async () => {
    sessions.findById.mockResolvedValue(baseSession());

    await useCase.execute('s1', 'u1');

    expect(sessions.revoke).toHaveBeenCalledWith('s1');
  });

  it('throws 404 when session does not exist', async () => {
    sessions.findById.mockResolvedValue(null);

    await expect(useCase.execute('s1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('forbids revoking another user’s session', async () => {
    sessions.findById.mockResolvedValue(baseSession({ userId: 'attacker' }));

    await expect(useCase.execute('s1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(sessions.revoke).not.toHaveBeenCalled();
  });

  it('is idempotent — does nothing when session is already revoked', async () => {
    sessions.findById.mockResolvedValue(baseSession({ revokedAt: new Date() }));

    await useCase.execute('s1', 'u1');

    expect(sessions.revoke).not.toHaveBeenCalled();
  });
});
