import { ListAuditLogsUseCase } from './list-audit-logs.use-case';
import { AuditLogsRepository } from '../repositories/audit-logs.repository.interface';
import { AuditLog } from '../entities/audit-log.entity';

describe('ListAuditLogsUseCase', () => {
  let logs: jest.Mocked<AuditLogsRepository>;
  let useCase: ListAuditLogsUseCase;

  const sampleLog = (overrides: Partial<AuditLog> = {}): AuditLog => ({
    id: 'log1',
    userId: 'u1',
    workspaceId: 'w1',
    action: 'user.created',
    resource: 'User',
    resourceId: 'u2',
    metadata: { foo: 'bar' },
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
    createdAt: new Date(),
    prevHash: null,
    hash: 'hash',
    ...overrides,
  });

  beforeEach(() => {
    logs = {
      create: jest.fn(),
      findMany: jest.fn(),
      deleteOlderThan: jest.fn(),
      countAll: jest.fn(),
      iterateChainAsc: jest.fn(),
    };
    useCase = new ListAuditLogsUseCase(logs);
  });

  it('returns paginated audit logs with correct metadata', async () => {
    logs.findMany.mockResolvedValue({
      items: [sampleLog(), sampleLog({ id: 'log2' })],
      total: 12,
    });

    const result = await useCase.execute({
      workspaceId: 'w1',
      page: 1,
      limit: 5,
    });

    expect(result.data).toHaveLength(2);
    expect(result.meta).toEqual({
      page: 1,
      limit: 5,
      total: 12,
      totalPages: 3,
    });
  });

  it('forwards filters to the repository', async () => {
    logs.findMany.mockResolvedValue({ items: [], total: 0 });
    const from = new Date('2026-01-01');
    const to = new Date('2026-01-31');

    await useCase.execute({
      workspaceId: 'w1',
      userId: 'u9',
      action: 'user.*',
      from,
      to,
      page: 2,
      limit: 10,
    });

    expect(logs.findMany).toHaveBeenCalledWith({
      workspaceId: 'w1',
      userId: 'u9',
      action: 'user.*',
      from,
      to,
      page: 2,
      limit: 10,
    });
  });

  it('returns 0 totalPages when there are no results', async () => {
    logs.findMany.mockResolvedValue({ items: [], total: 0 });

    const result = await useCase.execute({
      workspaceId: 'w1',
      page: 1,
      limit: 10,
    });

    expect(result.meta.total).toBe(0);
    expect(result.meta.totalPages).toBe(0);
    expect(result.data).toEqual([]);
  });
});
