import { CleanupExpiredSessionsUseCase } from './cleanup-expired-sessions.use-case';
import { SessionsRepository } from '../repositories/sessions.repository.interface';
import { env } from 'src/config/env.config';

describe('CleanupExpiredSessionsUseCase', () => {
  it('forwards the configured retention window to the repository', async () => {
    const sessions = {
      deleteExpired: jest.fn().mockResolvedValue(5),
    } as unknown as jest.Mocked<SessionsRepository>;
    const useCase = new CleanupExpiredSessionsUseCase(sessions);

    const result = await useCase.execute();

    expect(sessions.deleteExpired).toHaveBeenCalledWith(env.SESSION_RETENTION_DAYS);
    expect(result).toEqual({ deleted: 5 });
  });

  it('returns zero when nothing was deleted', async () => {
    const sessions = {
      deleteExpired: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<SessionsRepository>;
    const useCase = new CleanupExpiredSessionsUseCase(sessions);
    expect(await useCase.execute()).toEqual({ deleted: 0 });
  });
});
