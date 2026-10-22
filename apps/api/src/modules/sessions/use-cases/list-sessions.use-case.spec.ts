import { ListSessionsUseCase } from './list-sessions.use-case';
import { SessionsRepository } from '../repositories/sessions.repository.interface';

describe('ListSessionsUseCase', () => {
  let sessions: jest.Mocked<SessionsRepository>;
  let useCase: ListSessionsUseCase;

  beforeEach(() => {
    sessions = {
      findActiveByUser: jest.fn(),
    } as unknown as jest.Mocked<SessionsRepository>;
    useCase = new ListSessionsUseCase(sessions);
  });

  it('maps sessions and flags the current one', async () => {
    sessions.findActiveByUser.mockResolvedValue([
      {
        id: 's1',
        userAgent: 'browser-A',
        ipAddress: '10.0.0.1',
        lastUsedAt: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
      },
      {
        id: 's2',
        userAgent: 'browser-B',
        ipAddress: '10.0.0.2',
        lastUsedAt: new Date('2026-01-02'),
        createdAt: new Date('2026-01-02'),
      },
    ] as never);

    const result = await useCase.execute('u1', 's1');

    expect(sessions.findActiveByUser).toHaveBeenCalledWith('u1');
    expect(result).toEqual([
      expect.objectContaining({ id: 's1', isCurrent: true }),
      expect.objectContaining({ id: 's2', isCurrent: false }),
    ]);
  });

  it('returns isCurrent=false for every session when no currentSessionId is given', async () => {
    sessions.findActiveByUser.mockResolvedValue([
      {
        id: 's1',
        userAgent: null,
        ipAddress: null,
        lastUsedAt: new Date(),
        createdAt: new Date(),
      },
    ] as never);

    const [only] = await useCase.execute('u1');
    expect(only!.isCurrent).toBe(false);
  });
});
