import { createCache } from 'cache-manager';
import { PrismaService } from '@shared/database/prisma.service';
import { CacheService } from '@shared/cache/cache.service';
import { PrismaUsersRepository } from './prisma-users.repository';

type UserClient = {
  create: jest.Mock;
  findFirst: jest.Mock;
  findUnique: jest.Mock;
  findMany: jest.Mock;
  count: jest.Mock;
  update: jest.Mock;
};

type DeleteManyClient = { deleteMany: jest.Mock };

type PrismaMock = {
  user: UserClient;
  session: DeleteManyClient;
  emailVerifyToken: DeleteManyClient;
  passwordResetToken: DeleteManyClient;
  $transaction: jest.Mock;
};

describe('PrismaUsersRepository', () => {
  let prisma: PrismaMock;
  let repo: PrismaUsersRepository;

  const baseUser = {
    id: 'u1',
    email: 'jane@example.com',
    name: 'Jane',
    passwordHash: 'hash',
    twoFactorEnabled: false,
    twoFactorSecret: null,
    recoveryCodes: null,
    emailVerifiedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    deletedAt: null,
    anonymizedAt: null,
  };

  beforeEach(() => {
    prisma = {
      user: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      session: { deleteMany: jest.fn() },
      emailVerifyToken: { deleteMany: jest.fn() },
      passwordResetToken: { deleteMany: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    repo = new PrismaUsersRepository(
      prisma as unknown as PrismaService,
      new CacheService(createCache()),
    );
  });

  describe('with cache enabled — exercises @Cacheable key arrows', () => {
    it('findById and findByIdInWorkspace serve from cache on repeat call', async () => {
      prisma.user.findFirst.mockResolvedValue(baseUser);
      await repo.findById('u1');
      await repo.findById('u1');
      await repo.findByIdInWorkspace('u1', 'w1');
      await repo.findByIdInWorkspace('u1', 'w1');
      expect(prisma.user.findFirst).toHaveBeenCalledTimes(2);
    });
  });

  describe('create', () => {
    it('persists the user and returns mapped entity', async () => {
      prisma.user.create.mockResolvedValue(baseUser);

      const result = await repo.create({
        email: 'jane@example.com',
        name: 'Jane',
        passwordHash: 'hash',
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { email: 'jane@example.com', name: 'Jane', passwordHash: 'hash' },
      });
      expect(result.id).toBe('u1');
      expect(result.email).toBe('jane@example.com');
    });
  });

  describe('findById', () => {
    it('filters by id and deletedAt and returns mapped entity', async () => {
      prisma.user.findFirst.mockResolvedValue(baseUser);

      const result = await repo.findById('u1');

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'u1', deletedAt: null },
      });
      expect(result?.id).toBe('u1');
    });

    it('returns null when not found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      expect(await repo.findById('missing')).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('filters by email and deletedAt', async () => {
      prisma.user.findFirst.mockResolvedValue(baseUser);

      const result = await repo.findByEmail('jane@example.com');

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'jane@example.com', deletedAt: null },
      });
      expect(result?.email).toBe('jane@example.com');
    });

    it('returns null when not found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      expect(await repo.findByEmail('missing@example.com')).toBeNull();
    });
  });

  describe('findByIdInWorkspace', () => {
    it('filters by membership and deletedAt', async () => {
      prisma.user.findFirst.mockResolvedValue(baseUser);

      const result = await repo.findByIdInWorkspace('u1', 'w1');

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'u1',
          deletedAt: null,
          memberships: { some: { workspaceId: 'w1' } },
        },
      });
      expect(result?.id).toBe('u1');
    });

    it('returns null when not a member', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      expect(await repo.findByIdInWorkspace('u1', 'w1')).toBeNull();
    });
  });

  describe('update', () => {
    it('persists changes and returns mapped entity', async () => {
      prisma.user.update.mockResolvedValue({ ...baseUser, name: 'Jane Doe' });

      const result = await repo.update('u1', { name: 'Jane Doe' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { name: 'Jane Doe' },
      });
      expect(result.name).toBe('Jane Doe');
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt to a Date', async () => {
      prisma.user.update.mockResolvedValue(baseUser);

      await repo.softDelete('u1');

      const args = prisma.user.update.mock.calls[0][0] as {
        where: { id: string };
        data: { deletedAt: Date };
      };
      expect(args.where).toEqual({ id: 'u1' });
      expect(args.data.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('restore', () => {
    it('clears deletedAt', async () => {
      prisma.user.update.mockResolvedValue(baseUser);
      await repo.restore('u1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { deletedAt: null },
      });
    });
  });

  describe('account lockout', () => {
    it('incrementFailedLoginAttempts uses Prisma atomic increment and returns the new count', async () => {
      prisma.user.update.mockResolvedValue({
        ...baseUser,
        failedLoginAttempts: 3,
      });
      const result = await repo.incrementFailedLoginAttempts('u1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { failedLoginAttempts: { increment: 1 } },
        select: { failedLoginAttempts: true },
      });
      expect(result).toBe(3);
    });

    it('lockAccount sets lockedUntil to the provided Date', async () => {
      prisma.user.update.mockResolvedValue(baseUser);
      const until = new Date('2026-12-31T00:00:00Z');
      await repo.lockAccount('u1', until);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { lockedUntil: until },
      });
    });

    it('resetFailedLoginAttempts clears the counter and the lock', async () => {
      prisma.user.update.mockResolvedValue(baseUser);
      await repo.resetFailedLoginAttempts('u1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    });
  });

  describe('findByEmailIncludingDeleted', () => {
    it('returns soft-deleted users but not anonymized', async () => {
      prisma.user.findFirst.mockResolvedValue(baseUser);
      await repo.findByEmailIncludingDeleted('jane@example.com');
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'jane@example.com', anonymizedAt: null },
      });
    });
  });

  describe('findPendingAnonymization', () => {
    it('queries users soft-deleted before cutoff and not yet anonymized', async () => {
      prisma.user.findMany.mockResolvedValue([baseUser]);
      const cutoff = new Date('2026-04-20');
      const result = await repo.findPendingAnonymization(cutoff);
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: { lt: cutoff, not: null },
          anonymizedAt: null,
        },
      });
      expect(result[0]!.id).toBe('u1');
    });
  });

  describe('anonymize', () => {
    it('runs a transaction that scrubs PII and deletes related secrets', async () => {
      await repo.anonymize('u1');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const ops = prisma.$transaction.mock.calls[0][0] as unknown[];
      expect(ops).toHaveLength(4);
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
      expect(prisma.emailVerifyToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
      const userUpdateArgs = prisma.user.update.mock.calls[0][0] as {
        where: { id: string };
        data: {
          email: string;
          name: string;
          passwordHash: null;
          twoFactorEnabled: boolean;
          twoFactorSecret: null;
          recoveryCodes: null;
          emailVerifiedAt: null;
          anonymizedAt: Date;
        };
      };
      expect(userUpdateArgs.where).toEqual({ id: 'u1' });
      expect(userUpdateArgs.data.email).toBe('deleted-u1@anonymized.local');
      expect(userUpdateArgs.data.name).toBe('Deleted User');
      expect(userUpdateArgs.data.passwordHash).toBeNull();
      expect(userUpdateArgs.data.twoFactorEnabled).toBe(false);
      expect(userUpdateArgs.data.twoFactorSecret).toBeNull();
      expect(userUpdateArgs.data.recoveryCodes).toBeNull();
      expect(userUpdateArgs.data.emailVerifiedAt).toBeNull();
      expect(userUpdateArgs.data.anonymizedAt).toBeInstanceOf(Date);
    });
  });

  describe('token invalidation', () => {
    it('findTokensInvalidatedAt returns the column value when present', async () => {
      const at = new Date('2026-05-21T10:00:00Z');
      prisma.user.findUnique.mockResolvedValue({ tokensInvalidatedAt: at });
      const result = await repo.findTokensInvalidatedAt('u1');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'u1' },
        select: { tokensInvalidatedAt: true },
      });
      expect(result).toEqual(at);
    });

    it('findTokensInvalidatedAt returns null when row is missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      expect(await repo.findTokensInvalidatedAt('missing')).toBeNull();
    });

    it('invalidateTokens stamps the user with a fresh date', async () => {
      prisma.user.update.mockResolvedValue(baseUser);
      await repo.invalidateTokens('u1');
      const args = prisma.user.update.mock.calls[0][0] as {
        where: { id: string };
        data: { tokensInvalidatedAt: Date };
      };
      expect(args.where).toEqual({ id: 'u1' });
      expect(args.data.tokensInvalidatedAt).toBeInstanceOf(Date);
    });
  });

  describe('findManyByWorkspace', () => {
    it('returns mapped items with paging and no search filter', async () => {
      prisma.user.findMany.mockResolvedValue([baseUser]);
      prisma.user.count.mockResolvedValue(1);

      const result = await repo.findManyByWorkspace({
        workspaceId: 'w1',
        page: 1,
        limit: 20,
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          memberships: { some: { workspaceId: 'w1' } },
        },
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          memberships: { some: { workspaceId: 'w1' } },
        },
      });
      expect(result.total).toBe(1);
      expect(result.items[0]!.id).toBe('u1');
    });

    it('adds OR clause and respects paging when search is provided', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await repo.findManyByWorkspace({
        workspaceId: 'w1',
        page: 2,
        limit: 5,
        search: 'jane',
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          memberships: { some: { workspaceId: 'w1' } },
          OR: [
            { name: { contains: 'jane', mode: 'insensitive' } },
            { email: { contains: 'jane', mode: 'insensitive' } },
          ],
        },
        skip: 5,
        take: 5,
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
