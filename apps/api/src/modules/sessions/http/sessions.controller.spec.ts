import { SessionsController } from './sessions.controller';
import { ListSessionsUseCase } from '../use-cases/list-sessions.use-case';
import { RevokeSessionUseCase } from '../use-cases/revoke-session.use-case';
import { RevokeAllSessionsUseCase } from '../use-cases/revoke-all-sessions.use-case';
import type { AccessTokenPayload } from '@modules/auth/services/token.service';

describe('SessionsController', () => {
  let listSessions: jest.Mocked<ListSessionsUseCase>;
  let revokeSession: jest.Mocked<RevokeSessionUseCase>;
  let revokeAllSessions: jest.Mocked<RevokeAllSessionsUseCase>;
  let controller: SessionsController;

  const user: AccessTokenPayload = {
    id: 'u1',
    sessionId: 'current-session',
  };

  beforeEach(() => {
    listSessions = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListSessionsUseCase>;
    revokeSession = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<RevokeSessionUseCase>;
    revokeAllSessions = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<RevokeAllSessionsUseCase>;
    controller = new SessionsController(listSessions, revokeSession, revokeAllSessions);
  });

  it('list forwards user id and current session id', async () => {
    listSessions.execute.mockResolvedValue([] as never);
    await controller.list(user);
    expect(listSessions.execute).toHaveBeenCalledWith('u1', 'current-session');
  });

  it('revoke forwards session id and user id', async () => {
    revokeSession.execute.mockResolvedValue(undefined);
    await controller.revoke('s1', user);
    expect(revokeSession.execute).toHaveBeenCalledWith('s1', 'u1');
  });

  it('revokeAll forwards user id and current session id (kept alive)', async () => {
    revokeAllSessions.execute.mockResolvedValue(undefined);
    await controller.revokeAll(user);
    expect(revokeAllSessions.execute).toHaveBeenCalledWith('u1', 'current-session');
  });
});
