import { CreateSessionUseCase } from './create-session.use-case';
import { SessionsRepository } from '../repositories/sessions.repository.interface';
import { CryptoUtil } from '@shared/utils/crypto.util';

describe('CreateSessionUseCase', () => {
  let sessions: jest.Mocked<SessionsRepository>;
  let useCase: CreateSessionUseCase;

  beforeEach(() => {
    sessions = {
      create: jest.fn(),
    } as unknown as jest.Mocked<SessionsRepository>;
    useCase = new CreateSessionUseCase(sessions);
  });

  it('hashes the refresh token and persists with a 7-day expiry', async () => {
    sessions.create.mockResolvedValue({ id: 's1' } as never);
    const before = Date.now();

    await useCase.execute({
      userId: 'u1',
      refreshToken: 'rt-secret',
      userAgent: 'jest',
      ipAddress: '10.0.0.1',
    });

    const arg = sessions.create.mock.calls[0]![0];
    expect(arg.userId).toBe('u1');
    expect(arg.refreshTokenHash).toBe(CryptoUtil.hashToken('rt-secret'));
    expect(arg.userAgent).toBe('jest');
    expect(arg.ipAddress).toBe('10.0.0.1');
    const elapsed = arg.expiresAt.getTime() - before;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(elapsed).toBeGreaterThanOrEqual(sevenDays - 1000);
    expect(elapsed).toBeLessThanOrEqual(sevenDays + 1000);
  });

  it('defaults userAgent and ipAddress to null when not provided', async () => {
    sessions.create.mockResolvedValue({ id: 's1' } as never);
    await useCase.execute({ userId: 'u1', refreshToken: 'rt' });
    const arg = sessions.create.mock.calls[0]![0];
    expect(arg.userAgent).toBeNull();
    expect(arg.ipAddress).toBeNull();
  });
});
