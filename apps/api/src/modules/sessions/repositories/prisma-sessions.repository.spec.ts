import { createCache } from 'cache-manager';
import { PrismaService } from '@shared/database/prisma.service';
import { CacheService } from '@shared/cache/cache.service';
import { PrismaSessionsRepository } from './prisma-sessions.repository';

type SessionClient = {
  create: jest.Mock;
  findUnique: jest.Mock;
  findMany: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  deleteMany: jest.Mock;
};

type PrismaMock = { session: SessionClient };

describe('PrismaSessionsRepository', () => {
  let prisma: PrismaMock;
  let repo: PrismaSessionsRepository;

  const baseRow = {
    id: 's1',
    userId: 'u1',
    refreshTokenHash: 'hash',
    userAgent: 'jest',
    ipAddress: '1.2.3.4',
    expiresAt: new Date('2026-12-31'),
    revokedAt: null,
    lastUsedAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    prisma = {
      session: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    repo = new PrismaSessionsRepository(
      prisma as unknown as PrismaService,
      new CacheService(createCache()),
    );
  });

  describe('create', () => {
    it('persists and returns mapped entity', async () => {
      prisma.session.create.mockResolvedValue(baseRow);

      const result = await repo.create({
        userId: 'u1',
        refreshTokenHash: 'hash',
        userAgent: 'jest',
        ipAddress: '1.2.3.4',
        expiresAt: baseRow.expiresAt,
      });

      expect(prisma.session.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          refreshTokenHash: 'hash',
          userAgent: 'jest',
          ipAddress: '1.2.3.4',
          expiresAt: baseRow.expiresAt,
        },
      });
      expect(result.id).toBe('s1');
    });
  });

  describe('findById', () => {
    it('returns mapped entity', async () => {
      prisma.session.findUnique.mockResolvedValue(baseRow);
      const result = await repo.findById('s1');
      expect(prisma.session.findUnique).toHaveBeenCalledWith({
        where: { id: 's1' },
      });
      expect(result?.id).toBe('s1');
    });

    it('returns null when not found', async () => {
      prisma.session.findUnique.mockResolvedValue(null);
      expect(await repo.findById('missing')).toBeNull();
    });
  });

  describe('findByTokenHash', () => {
    it('returns mapped entity', async () => {
      prisma.session.findUnique.mockResolvedValue(baseRow);
      const result = await repo.findByTokenHash('hash');
      expect(prisma.session.findUnique).toHaveBeenCalledWith({
        where: { refreshTokenHash: 'hash' },
      });
      expect(result?.refreshTokenHash).toBe('hash');
    });

    it('returns null when not found', async () => {
      prisma.session.findUnique.mockResolvedValue(null);
      expect(await repo.findByTokenHash('hash')).toBeNull();
    });
  });

  describe('findActiveByUser', () => {
    it('returns sessions where revokedAt null and not expired', async () => {
      prisma.session.findMany.mockResolvedValue([baseRow]);

      const result = await repo.findActiveByUser('u1');

      const args = prisma.session.findMany.mock.calls[0][0] as {
        where: {
          userId: string;
          revokedAt: null;
          expiresAt: { gt: Date };
        };
        orderBy: { lastUsedAt: 'desc' };
      };
      expect(args.where.userId).toBe('u1');
      expect(args.where.revokedAt).toBeNull();
      expect(args.where.expiresAt.gt).toBeInstanceOf(Date);
      expect(args.orderBy).toEqual({ lastUsedAt: 'desc' });
      expect(result).toHaveLength(1);
    });

    it('returns empty array when none', async () => {
      prisma.session.findMany.mockResolvedValue([]);
      expect(await repo.findActiveByUser('u1')).toEqual([]);
    });
  });

  describe('revoke', () => {
    it('updates revokedAt to a Date', async () => {
      prisma.session.update.mockResolvedValue(baseRow);
      await repo.revoke('s1');
      const args = prisma.session.update.mock.calls[0][0] as {
        where: { id: string };
        data: { revokedAt: Date };
      };
      expect(args.where).toEqual({ id: 's1' });
      expect(args.data.revokedAt).toBeInstanceOf(Date);
    });
  });

  describe('revokeAllForUser', () => {
    it('revokes all active sessions for the user', async () => {
      prisma.session.updateMany.mockResolvedValue({ count: 3 });
      await repo.revokeAllForUser('u1');
      const args = prisma.session.updateMany.mock.calls[0][0] as {
        where: { userId: string; revokedAt: null };
        data: { revokedAt: Date };
      };
      expect(args.where).toEqual({ userId: 'u1', revokedAt: null });
      expect(args.data.revokedAt).toBeInstanceOf(Date);
    });

    it('excludes a specific session id when provided', async () => {
      prisma.session.updateMany.mockResolvedValue({ count: 2 });
      await repo.revokeAllForUser('u1', 's1');
      const args = prisma.session.updateMany.mock.calls[0][0] as {
        where: {
          userId: string;
          revokedAt: null;
          id: { not: string };
        };
      };
      expect(args.where.id).toEqual({ not: 's1' });
    });
  });

  describe('deleteExpired', () => {
    it('deletes sessions older than retentionDays and returns the count', async () => {
      prisma.session.deleteMany.mockResolvedValue({ count: 7 });

      const count = await repo.deleteExpired(30);

      const args = prisma.session.deleteMany.mock.calls[0][0] as {
        where: { expiresAt: { lt: Date } };
      };
      expect(args.where.expiresAt.lt).toBeInstanceOf(Date);
      const cutoff = args.where.expiresAt.lt.getTime();
      const expectedRoughCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      expect(Math.abs(cutoff - expectedRoughCutoff)).toBeLessThan(5_000);
      expect(count).toBe(7);
    });
  });
});
