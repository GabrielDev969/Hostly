import { createCache } from 'cache-manager';
import { PrismaService } from '@shared/database/prisma.service';
import { CacheService } from '@shared/cache/cache.service';
import { PrismaPermissionsRepository } from './prisma-permissions.repository';

type PermissionClient = {
  findMany: jest.Mock;
  findUnique: jest.Mock;
  findFirst: jest.Mock;
};

type PrismaMock = { permission: PermissionClient };

describe('PrismaPermissionsRepository', () => {
  let prisma: PrismaMock;
  let repo: PrismaPermissionsRepository;

  const baseRow = {
    id: 'p1',
    key: 'user:read',
    description: 'Read users',
    category: 'user',
    workspaceId: null as string | null,
  };

  let cacheService: CacheService;

  beforeEach(() => {
    prisma = {
      permission: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    cacheService = new CacheService(createCache());
    repo = new PrismaPermissionsRepository(prisma as unknown as PrismaService, cacheService);
  });

  describe('with cache enabled — exercises @Cacheable key arrows', () => {
    it('findAll runs through the cache wrapper on first call and serves from cache on second', async () => {
      prisma.permission.findMany.mockResolvedValue([baseRow]);
      await repo.findAll();
      await repo.findAll();
      expect(prisma.permission.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('findAll', () => {
    it('returns mapped global permissions ordered by category then key', async () => {
      prisma.permission.findMany.mockResolvedValue([baseRow]);

      const result = await repo.findAll();

      expect(prisma.permission.findMany).toHaveBeenCalledWith({
        where: { workspaceId: null },
        orderBy: [{ category: 'asc' }, { key: 'asc' }],
      });
      expect(result).toEqual([baseRow]);
    });

    it('returns empty array when no permissions', async () => {
      prisma.permission.findMany.mockResolvedValue([]);
      expect(await repo.findAll()).toEqual([]);
    });
  });

  describe('findByKey', () => {
    it('returns mapped entity scoped to global permissions', async () => {
      prisma.permission.findFirst.mockResolvedValue(baseRow);
      const result = await repo.findByKey('user:read');
      expect(prisma.permission.findFirst).toHaveBeenCalledWith({
        where: { key: 'user:read', workspaceId: null },
      });
      expect(result?.key).toBe('user:read');
    });

    it('returns null when not found', async () => {
      prisma.permission.findFirst.mockResolvedValue(null);
      expect(await repo.findByKey('missing')).toBeNull();
    });
  });

  describe('findManyByKeys', () => {
    it('returns mapped global permissions for given keys', async () => {
      prisma.permission.findMany.mockResolvedValue([baseRow]);
      const result = await repo.findManyByKeys(['user:read']);
      expect(prisma.permission.findMany).toHaveBeenCalledWith({
        where: { key: { in: ['user:read'] }, workspaceId: null },
      });
      expect(result).toHaveLength(1);
    });

    it('returns empty array when none match', async () => {
      prisma.permission.findMany.mockResolvedValue([]);
      expect(await repo.findManyByKeys(['nope'])).toEqual([]);
    });
  });

  describe('findByCategory', () => {
    it('returns mapped global permissions filtered by category', async () => {
      prisma.permission.findMany.mockResolvedValue([baseRow]);
      const result = await repo.findByCategory('user');
      expect(prisma.permission.findMany).toHaveBeenCalledWith({
        where: { category: 'user', workspaceId: null },
        orderBy: { key: 'asc' },
      });
      expect(result[0]!.category).toBe('user');
    });

    it('returns empty array when none match', async () => {
      prisma.permission.findMany.mockResolvedValue([]);
      expect(await repo.findByCategory('admin')).toEqual([]);
    });
  });
});
