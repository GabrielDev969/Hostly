import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ScopedPrismaService } from '@shared/tenancy/scoped-prisma.service';
import { computeAuditHash, PrismaAuditLogsRepository } from './prisma-audit-logs.repository';

type AuditLogClient = {
  create: jest.Mock;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  count: jest.Mock;
  deleteMany: jest.Mock;
};

type PrismaMock = {
  auditLog: AuditLogClient;
  $transaction: jest.Mock;
  $executeRaw: jest.Mock;
};

describe('PrismaAuditLogsRepository', () => {
  let prisma: PrismaMock;
  let repo: PrismaAuditLogsRepository;

  const baseRow = {
    id: 'log1',
    userId: 'u1',
    workspaceId: 'w1',
    organizationId: 'org1',
    clientId: 'client-a',
    action: 'user.login',
    resource: 'user',
    resourceId: 'u1',
    metadata: { ip: '1.2.3.4' },
    ipAddress: '1.2.3.4',
    userAgent: 'jest',
    prevHash: null,
    hash: 'h1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    prisma = {
      auditLog: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        deleteMany: jest.fn(),
      },
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    };
    repo = new PrismaAuditLogsRepository(
      prisma as unknown as PrismaService,
      { client: prisma } as unknown as ScopedPrismaService,
    );
  });

  describe('create', () => {
    it('acquires advisory lock, chains hash from previous row, persists row', async () => {
      prisma.auditLog.findFirst.mockResolvedValue({ hash: 'prev-hash' });
      prisma.auditLog.create.mockImplementation(({ data }) =>
        Promise.resolve({ ...baseRow, ...data }),
      );

      const result = await repo.create({
        userId: 'u1',
        workspaceId: 'w1',
        organizationId: 'org1',
        clientId: 'client-a',
        action: 'user.login',
        resource: 'user',
        resourceId: 'u1',
        metadata: { ip: '1.2.3.4' },
        ipAddress: '1.2.3.4',
        userAgent: 'jest',
      });

      expect(prisma.$executeRaw).toHaveBeenCalled();
      const createArgs = prisma.auditLog.create.mock.calls[0][0] as {
        data: {
          id: string;
          createdAt: Date;
          prevHash: string | null;
          hash: string;
        };
      };
      expect(createArgs.data.prevHash).toBe('prev-hash');
      expect(createArgs.data.hash).toBe(
        computeAuditHash('prev-hash', {
          id: createArgs.data.id,
          userId: 'u1',
          workspaceId: 'w1',
          organizationId: 'org1',
          clientId: 'client-a',
          action: 'user.login',
          resource: 'user',
          resourceId: 'u1',
          metadata: { ip: '1.2.3.4' },
          ipAddress: '1.2.3.4',
          userAgent: 'jest',
          createdAt: createArgs.data.createdAt,
        }),
      );
      expect(result.hash).toBe(createArgs.data.hash);
      expect(result.prevHash).toBe('prev-hash');
    });

    it('uses null prevHash when chain is empty (genesis)', async () => {
      prisma.auditLog.findFirst.mockResolvedValue(null);
      prisma.auditLog.create.mockImplementation(({ data }) =>
        Promise.resolve({ ...baseRow, ...data }),
      );

      const result = await repo.create({ action: 'genesis.event' });

      expect(result.prevHash).toBeNull();
    });

    it('coerces missing metadata to Prisma.JsonNull', async () => {
      prisma.auditLog.findFirst.mockResolvedValue(null);
      prisma.auditLog.create.mockImplementation(({ data }) =>
        Promise.resolve({ ...baseRow, ...data }),
      );

      await repo.create({ action: 'user.login' });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ metadata: Prisma.JsonNull }),
      });
    });
  });

  describe('findMany', () => {
    it('returns paginated items with mapping and base where clause', async () => {
      prisma.auditLog.findMany.mockResolvedValue([baseRow]);
      prisma.auditLog.count.mockResolvedValue(1);

      const result = await repo.findMany({
        workspaceId: 'w1',
        page: 1,
        limit: 10,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'w1' },
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
      expect(prisma.auditLog.count).toHaveBeenCalledWith({
        where: { workspaceId: 'w1' },
      });
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe('log1');
    });

    it('applies userId, date range and exact action filters with paging', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      const from = new Date('2026-01-01');
      const to = new Date('2026-02-01');
      await repo.findMany({
        workspaceId: 'w1',
        userId: 'u1',
        action: 'user.login',
        from,
        to,
        page: 3,
        limit: 5,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          workspaceId: 'w1',
          userId: 'u1',
          createdAt: { gte: from, lte: to },
          action: 'user.login',
        },
        skip: 10,
        take: 5,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('uses startsWith filter when action ends with wildcard', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await repo.findMany({
        workspaceId: 'w1',
        action: 'user.*',
        page: 1,
        limit: 10,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: { startsWith: 'user.' },
          }),
        }),
      );
    });

    it('only sets the gte clause when only from is provided', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      const from = new Date('2026-03-01');
      await repo.findMany({
        workspaceId: 'w1',
        from,
        page: 1,
        limit: 10,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: from },
          }),
        }),
      );
    });

    it('only sets the lte clause when only to is provided', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      const to = new Date('2026-04-01');
      await repo.findMany({
        workspaceId: 'w1',
        to,
        page: 1,
        limit: 10,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { lte: to },
          }),
        }),
      );
    });
  });

  describe('deleteOlderThan', () => {
    it('deletes rows older than cutoff and returns the count', async () => {
      prisma.auditLog.deleteMany.mockResolvedValue({ count: 12 });
      const cutoff = new Date('2025-05-20');
      const deleted = await repo.deleteOlderThan(cutoff);
      expect(prisma.auditLog.deleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: cutoff } },
      });
      expect(deleted).toBe(12);
    });
  });

  describe('countAll', () => {
    it('returns prisma.auditLog.count() result', async () => {
      prisma.auditLog.count.mockResolvedValue(42);
      expect(await repo.countAll()).toBe(42);
    });
  });

  describe('iterateChainAsc', () => {
    it('returns first page with nextCursor when results fill the page', async () => {
      prisma.auditLog.findMany.mockResolvedValue([
        { ...baseRow, id: 'a' },
        { ...baseRow, id: 'b' },
      ]);
      const page = await repo.iterateChainAsc(null, 2);
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 2,
      });
      expect(page.items.map((i) => i.id)).toEqual(['a', 'b']);
      expect(page.nextCursor).toBe('b');
    });

    it('uses cursor + skip when afterId is provided', async () => {
      prisma.auditLog.findMany.mockResolvedValue([{ ...baseRow, id: 'c' }]);
      await repo.iterateChainAsc('b', 2);
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        cursor: { id: 'b' },
        skip: 1,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 2,
      });
    });

    it('nextCursor null when the page is not full', async () => {
      prisma.auditLog.findMany.mockResolvedValue([{ ...baseRow, id: 'a' }]);
      const page = await repo.iterateChainAsc(null, 10);
      expect(page.nextCursor).toBeNull();
    });
  });
});
