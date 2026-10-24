import {
  startTestDatabase,
  stopTestDatabase,
  resetDatabase,
  getPrisma,
} from './helpers/test-database';
import { seedPermissions } from './helpers/seed-permissions';
import { createRedisCache } from './helpers/redis-cache';
import type { Cache } from 'cache-manager';
import { PrismaUsersRepository } from '../src/modules/users/repositories/prisma-users.repository';
import { PrismaSessionsRepository } from '../src/modules/sessions/repositories/prisma-sessions.repository';
import { PrismaWorkspacesRepository } from '../src/modules/workspaces/repositories/prisma-workspaces.repository';
import { PrismaWorkspaceMembersRepository } from '../src/modules/workspaces/repositories/prisma-workspace-members.repository';
import { PrismaRolesRepository } from '../src/modules/rbac/repositories/prisma-roles.repository';
import { PrismaPermissionsRepository } from '../src/modules/rbac/repositories/prisma-permissions.repository';
import { PrismaFeatureFlagsRepository } from '../src/modules/feature-flags/repositories/prisma-feature-flags.repository';
import { FeatureFlagsService } from '../src/modules/feature-flags/services/feature-flags.service';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ScopedPrismaService } from '../src/shared/tenancy/scoped-prisma.service';
import { CacheService } from '../src/shared/cache/cache.service';
import { ADMIN_WORKSPACE_SLUG, SUPER_ADMIN_ROLE } from '../src/modules/rbac/constants/system';
import { PERMISSIONS } from '../src/modules/rbac/constants/permissions';

// Every @Cacheable method through the Redis store production uses: a hit must equal the database read, Dates included.
describe('@Cacheable over Redis (integration)', () => {
  let cache: Cache;
  let users: PrismaUsersRepository;
  let sessions: PrismaSessionsRepository;
  let workspaces: PrismaWorkspacesRepository;
  let members: PrismaWorkspaceMembersRepository;
  let roles: PrismaRolesRepository;
  let permissions: PrismaPermissionsRepository;
  let featureFlags: FeatureFlagsService;
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    await startTestDatabase();
    const prisma = getPrisma() as unknown as PrismaService;
    cache = createRedisCache();
    const cacheService = new CacheService(cache);
    users = new PrismaUsersRepository(prisma, cacheService);
    sessions = new PrismaSessionsRepository(prisma, cacheService);
    workspaces = new PrismaWorkspacesRepository(prisma, cacheService);
    // The two cached lookups read through the raw client; the scoped one is never reached here.
    members = new PrismaWorkspaceMembersRepository(prisma, {} as ScopedPrismaService, cacheService);
    roles = new PrismaRolesRepository(prisma, cacheService);
    permissions = new PrismaPermissionsRepository(prisma, cacheService);
    featureFlags = new FeatureFlagsService(new PrismaFeatureFlagsRepository(prisma), cacheService);
  });

  afterAll(async () => {
    await cache.disconnect();
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedPermissions();

    const user = await users.create({
      email: 'jane@example.com',
      name: 'Jane',
      passwordHash: 'hash',
    });
    userId = user.id;
    await getPrisma().user.update({
      where: { id: userId },
      data: {
        emailVerifiedAt: new Date('2026-01-02T03:04:05.006Z'),
        lockedUntil: new Date('2026-01-03T00:00:00.000Z'),
        tokensInvalidatedAt: new Date('2026-01-04T00:00:00.000Z'),
      },
    });

    const result = await workspaces.createWithDefaults({
      name: 'Acme',
      slug: ADMIN_WORKSPACE_SLUG,
      isPersonal: false,
      ownerId: userId,
      ownerRoleName: SUPER_ADMIN_ROLE,
      internalClientName: 'Own robots',
      defaultRoles: [
        { name: SUPER_ADMIN_ROLE, isSystem: true, permissionKeys: [PERMISSIONS.USER.READ] },
      ],
    });
    workspaceId = result.workspace.id;
  });

  // Reads twice with a direct row change in between: the stale second read proves it came from the cache.
  async function readTwice<T>(read: () => Promise<T>, change: () => Promise<unknown>) {
    const first = await read();
    await change();
    const second = await read();
    return { first, second };
  }

  it('users.findById', async () => {
    const { first, second } = await readTwice(
      () => users.findById(userId),
      () => getPrisma().user.update({ where: { id: userId }, data: { name: 'Changed' } }),
    );
    expect(second).toStrictEqual(first);
    expect(second?.name).toBe('Jane');
    for (const field of [
      'emailVerifiedAt',
      'lockedUntil',
      'tokensInvalidatedAt',
      'createdAt',
    ] as const) {
      expect(second?.[field]).toBeInstanceOf(Date);
    }
  });

  it('users.findByIdInWorkspace', async () => {
    const { first, second } = await readTwice(
      () => users.findByIdInWorkspace(userId, workspaceId),
      () => getPrisma().user.update({ where: { id: userId }, data: { name: 'Changed' } }),
    );
    expect(second).toStrictEqual(first);
    expect(second?.name).toBe('Jane');
    expect(second?.createdAt).toBeInstanceOf(Date);
    expect(second?.updatedAt).toBeInstanceOf(Date);
  });

  it('users.findTokensInvalidatedAt', async () => {
    const { first, second } = await readTwice(
      () => users.findTokensInvalidatedAt(userId),
      () =>
        getPrisma().user.update({
          where: { id: userId },
          data: { tokensInvalidatedAt: new Date('2026-02-01T00:00:00.000Z') },
        }),
    );
    expect(second).toStrictEqual(first);
    expect(second).toBeInstanceOf(Date);
    expect(second?.getTime()).toBe(Date.parse('2026-01-04T00:00:00.000Z'));
  });

  it('sessions.findById', async () => {
    const session = await sessions.create({
      userId,
      refreshTokenHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const { first, second } = await readTwice(
      () => sessions.findById(session.id),
      () =>
        getPrisma().session.update({ where: { id: session.id }, data: { revokedAt: new Date() } }),
    );
    expect(second).toStrictEqual(first);
    expect(second?.revokedAt).toBeNull();
    for (const field of ['expiresAt', 'lastUsedAt', 'createdAt'] as const) {
      expect(second?.[field]).toBeInstanceOf(Date);
    }
  });

  it('workspaceMembers.findByUserAndWorkspace', async () => {
    const { first, second } = await readTwice(
      () => members.findByUserAndWorkspace(userId, workspaceId),
      () =>
        getPrisma().workspaceMember.updateMany({
          where: { userId, workspaceId },
          data: { joinedAt: new Date('2020-01-01T00:00:00.000Z') },
        }),
    );
    expect(second).toStrictEqual(first);
    expect(second?.joinedAt).toBeInstanceOf(Date);
    expect(second?.joinedAt.getTime()).not.toBe(Date.parse('2020-01-01T00:00:00.000Z'));
  });

  it('workspaceMembers.findSuperAdminMembership', async () => {
    const { first, second } = await readTwice(
      () => members.findSuperAdminMembership(userId),
      () =>
        getPrisma().workspaceMember.updateMany({
          where: { userId, workspaceId },
          data: { joinedAt: new Date('2020-01-01T00:00:00.000Z') },
        }),
    );
    expect(first).not.toBeNull();
    expect(second).toStrictEqual(first);
    expect(second?.joinedAt).toBeInstanceOf(Date);
  });

  it('roles.findManyByWorkspace', async () => {
    const { first, second } = await readTwice(
      () => roles.findManyByWorkspace(workspaceId),
      () =>
        getPrisma().role.updateMany({ where: { workspaceId }, data: { description: 'Changed' } }),
    );
    expect(first.length).toBeGreaterThan(0);
    expect(second).toStrictEqual(first);
    for (const role of second) {
      expect(role.createdAt).toBeInstanceOf(Date);
      expect(role.updatedAt).toBeInstanceOf(Date);
    }
  });

  it('permissions.findAll', async () => {
    const { first, second } = await readTwice(
      () => permissions.findAll(),
      () => getPrisma().permission.updateMany({ data: { description: 'Changed' } }),
    );
    expect(first.length).toBeGreaterThan(0);
    expect(second).toStrictEqual(first);
  });

  it('featureFlags.getEffective', async () => {
    const { first, second } = await readTwice(
      () => featureFlags.getEffective(workspaceId),
      () =>
        getPrisma().workspaceFeatureFlag.create({
          data: { workspaceId, key: 'billing', enabled: false },
        }),
    );
    expect(second).toStrictEqual(first);
    expect(second.every((f) => !f.overridden)).toBe(true);
  });
});
