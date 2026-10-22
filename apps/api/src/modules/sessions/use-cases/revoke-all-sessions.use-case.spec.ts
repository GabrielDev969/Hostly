import { RevokeAllSessionsUseCase } from './revoke-all-sessions.use-case';
import { SessionsRepository } from '../repositories/sessions.repository.interface';

describe('RevokeAllSessionsUseCase', () => {
  let sessions: jest.Mocked<SessionsRepository>;
  let useCase: RevokeAllSessionsUseCase;

  beforeEach(() => {
    sessions = {
      revokeAllForUser: jest.fn(),
    } as unknown as jest.Mocked<SessionsRepository>;
    useCase = new RevokeAllSessionsUseCase(sessions);
  });

  it('forwards user id and exception to the repository', async () => {
    await useCase.execute('u1', 'current-session');
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith('u1', 'current-session');
  });

  it('passes undefined when no exception is given', async () => {
    await useCase.execute('u1');
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith('u1', undefined);
  });
});
