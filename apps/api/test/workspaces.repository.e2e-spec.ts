import {
  startTestDatabase,
  stopTestDatabase,
  resetDatabase,
  getPrisma,
} from './helpers/test-database';
import { seedPermissions } from './helpers/seed-permissions';
import { createCache } from 'cache-manager';
import { PrismaWorkspacesRepository } from '../src/modules/workspaces/repositories/prisma-workspaces.repository';
import { PrismaUsersRepository } from '../src/modules/users/repositories/prisma-users.repository';
import { PrismaService } from '../src/shared/database/prisma.service';
import { CacheService } from '../src/shared/cache/cache.service';
import { ALL_PERMISSION_KEYS } from '../src/modules/rbac/constants/permissions';

describe('PrismaWorkspacesRepository (integration)', () => {
  let workspaces: PrismaWorkspacesRepository;
  let users: PrismaUsersRepository;

  beforeAll(async () => {
    await startTestDatabase();
    const prisma = getPrisma() as unknown as PrismaService;
    const cacheService = new CacheService(createCache());
    workspaces = new PrismaWorkspacesRepository(prisma, cacheService);
    users = new PrismaUsersRepository(prisma, cacheService);
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedPermissions();
  });

  async function createWorkspaceFor(ownerEmail: string, name: string, slug: string) {
    const owner = await users.create({
      email: ownerEmail,
      name: ownerEmail.split('@')[0]!,
      passwordHash: 'hash',
    });
    const result = await workspaces.createWithDefaults({
      name,
      slug,
      isPersonal: false,
      ownerId: owner.id,
      ownerRoleName: 'Owner',
      defaultRoles: [
        {
          name: 'Owner',
          isSystem: true,
          permissionKeys: ALL_PERMISSION_KEYS,
        },
      ],
    });
    return { ownerId: owner.id, workspace: result.workspace };
  }

  it('returns the workspace by id and null when soft-deleted', async () => {
    const { workspace } = await createWorkspaceFor('a@example.com', 'Acme', 'acme');

    const found = await workspaces.findById(workspace.id);
    expect(found?.id).toBe(workspace.id);
    expect(found?.slug).toBe('acme');

    await workspaces.softDelete(workspace.id);
    expect(await workspaces.findById(workspace.id)).toBeNull();
  });

  it('lists only the workspaces the user is a member of', async () => {
    const { ownerId, workspace: ws1 } = await createWorkspaceFor(
      'owner@example.com',
      'Acme',
      'acme',
    );
    await createWorkspaceFor('other@example.com', 'Other Co', 'other-co');

    const list = await workspaces.findByUserId(ownerId);

    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(ws1.id);
  });
});
