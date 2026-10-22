import { createCache } from 'cache-manager';
import { PrismaService } from '@shared/database/prisma.service';
import { CacheService } from '@shared/cache/cache.service';
import { PrismaWorkspacesRepository } from './prisma-workspaces.repository';

type WorkspaceClient = {
  create: jest.Mock;
  findFirst: jest.Mock;
  update: jest.Mock;
};
type RoleClient = { create: jest.Mock };
type PermissionClient = { findMany: jest.Mock };
type WorkspaceMemberClient = {
  create: jest.Mock;
  findMany: jest.Mock;
};
type OrganizationClient = { create: jest.Mock };

type Tx = {
  workspace: WorkspaceClient;
  role: RoleClient;
  permission: PermissionClient;
  workspaceMember: WorkspaceMemberClient;
  organization: OrganizationClient;
};

type PrismaMock = {
  workspace: WorkspaceClient;
  workspaceMember: WorkspaceMemberClient & { update: jest.Mock };
  $transaction: jest.Mock;
};

const baseWorkspace = {
  id: 'w1',
  name: 'My Workspace',
  slug: 'my-workspace',
  isPersonal: false,
  ownerId: 'u1',
  organizationId: 'org1',
  deletedAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
};

describe('PrismaWorkspacesRepository', () => {
  let prisma: PrismaMock;
  let tx: Tx;
  let repo: PrismaWorkspacesRepository;

  beforeEach(() => {
    tx = {
      workspace: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      role: { create: jest.fn() },
      permission: { findMany: jest.fn() },
      workspaceMember: { create: jest.fn(), findMany: jest.fn() },
      organization: { create: jest.fn().mockResolvedValue({ id: 'org1' }) },
    };
    prisma = {
      workspace: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      workspaceMember: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (arg: unknown) => {
        if (typeof arg === 'function') {
          return (arg as (txArg: Tx) => Promise<unknown>)(tx);
        }
        return Promise.all(arg as Promise<unknown>[]);
      }),
    };
    repo = new PrismaWorkspacesRepository(
      prisma as unknown as PrismaService,
      new CacheService(createCache()),
    );
  });

  describe('createWithDefaults', () => {
    it('creates workspace, roles with mapped permissions and owner membership', async () => {
      tx.workspace.create.mockResolvedValue(baseWorkspace);
      tx.permission.findMany.mockResolvedValue([
        { id: 'p1', key: 'user:read' },
        { id: 'p2', key: 'user:write' },
      ]);
      tx.role.create
        .mockResolvedValueOnce({ id: 'roleOwner' })
        .mockResolvedValueOnce({ id: 'roleMember' });
      tx.workspaceMember.create.mockResolvedValue({});

      const result = await repo.createWithDefaults({
        name: 'My Workspace',
        slug: 'my-workspace',
        isPersonal: false,
        ownerId: 'u1',
        ownerRoleName: 'Owner',
        defaultRoles: [
          {
            name: 'Owner',
            description: 'Owner role',
            isSystem: true,
            permissionKeys: ['user:read', 'user:write'],
          },
          {
            name: 'Member',
            isSystem: true,
            permissionKeys: ['user:read'],
          },
        ],
      });

      expect(tx.organization.create).toHaveBeenCalledWith({
        data: {
          name: 'My Workspace',
          slug: 'org-my-workspace',
          ownerId: 'u1',
        },
      });
      expect(tx.workspace.create).toHaveBeenCalledWith({
        data: {
          name: 'My Workspace',
          slug: 'my-workspace',
          isPersonal: false,
          ownerId: 'u1',
          organizationId: 'org1',
        },
      });
      // permissions queried only for the unique union of keys
      const permArg = tx.permission.findMany.mock.calls[0][0] as {
        where: { key: { in: string[] } };
      };
      expect(permArg.where.key.in.sort()).toEqual(['user:read', 'user:write']);

      // owner role created with both permissions, member role with one
      expect(tx.role.create).toHaveBeenNthCalledWith(1, {
        data: {
          name: 'Owner',
          description: 'Owner role',
          workspaceId: 'w1',
          isSystem: true,
          permissions: {
            create: [{ permissionId: 'p1' }, { permissionId: 'p2' }],
          },
        },
      });
      expect(tx.role.create).toHaveBeenNthCalledWith(2, {
        data: {
          name: 'Member',
          description: undefined,
          workspaceId: 'w1',
          isSystem: true,
          permissions: { create: [{ permissionId: 'p1' }] },
        },
      });

      expect(tx.workspaceMember.create).toHaveBeenCalledWith({
        data: { userId: 'u1', workspaceId: 'w1', roleId: 'roleOwner' },
      });

      expect(result.workspace.id).toBe('w1');
      expect(result.ownerRoleId).toBe('roleOwner');
    });

    it('drops permission keys that have no matching permission row', async () => {
      tx.workspace.create.mockResolvedValue(baseWorkspace);
      tx.permission.findMany.mockResolvedValue([{ id: 'p1', key: 'user:read' }]);
      tx.role.create.mockResolvedValue({ id: 'roleOwner' });
      tx.workspaceMember.create.mockResolvedValue({});

      await repo.createWithDefaults({
        name: 'W',
        slug: 'w',
        isPersonal: true,
        ownerId: 'u1',
        ownerRoleName: 'Owner',
        defaultRoles: [
          {
            name: 'Owner',
            isSystem: true,
            permissionKeys: ['user:read', 'unknown:perm'],
          },
        ],
      });

      const args = tx.role.create.mock.calls[0][0] as {
        data: { permissions: { create: Array<{ permissionId: string }> } };
      };
      expect(args.data.permissions.create).toEqual([{ permissionId: 'p1' }]);
    });

    it('throws when ownerRoleName is not in defaultRoles', async () => {
      tx.workspace.create.mockResolvedValue(baseWorkspace);
      tx.permission.findMany.mockResolvedValue([]);
      tx.role.create.mockResolvedValue({ id: 'roleMember' });

      await expect(
        repo.createWithDefaults({
          name: 'W',
          slug: 'w',
          isPersonal: false,
          ownerId: 'u1',
          ownerRoleName: 'Owner',
          defaultRoles: [{ name: 'Member', isSystem: true, permissionKeys: [] }],
        }),
      ).rejects.toThrow('Owner role "Owner" not found in defaultRoles');
      expect(tx.workspaceMember.create).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('filters by id and deletedAt', async () => {
      prisma.workspace.findFirst.mockResolvedValue(baseWorkspace);
      const result = await repo.findById('w1');
      expect(prisma.workspace.findFirst).toHaveBeenCalledWith({
        where: { id: 'w1', deletedAt: null },
      });
      expect(result?.id).toBe('w1');
    });

    it('returns null when not found', async () => {
      prisma.workspace.findFirst.mockResolvedValue(null);
      expect(await repo.findById('missing')).toBeNull();
    });
  });

  describe('findBySlug', () => {
    it('filters by slug and deletedAt', async () => {
      prisma.workspace.findFirst.mockResolvedValue(baseWorkspace);
      const result = await repo.findBySlug('my-workspace');
      expect(prisma.workspace.findFirst).toHaveBeenCalledWith({
        where: { slug: 'my-workspace', deletedAt: null },
      });
      expect(result?.slug).toBe('my-workspace');
    });

    it('returns null when not found', async () => {
      prisma.workspace.findFirst.mockResolvedValue(null);
      expect(await repo.findBySlug('missing')).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('returns mapped workspaces from memberships', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue([{ workspace: baseWorkspace }]);
      const result = await repo.findByUserId('u1');
      expect(prisma.workspaceMember.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1', workspace: { deletedAt: null } },
        include: { workspace: true },
      });
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('w1');
    });

    it('returns empty array when none', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue([]);
      expect(await repo.findByUserId('u1')).toEqual([]);
    });
  });

  describe('update', () => {
    it('updates name and slug', async () => {
      prisma.workspace.update.mockResolvedValue({
        ...baseWorkspace,
        name: 'New',
        slug: 'new',
      });

      const result = await repo.update('w1', { name: 'New', slug: 'new' });

      expect(prisma.workspace.update).toHaveBeenCalledWith({
        where: { id: 'w1' },
        data: { name: 'New', slug: 'new' },
      });
      expect(result.name).toBe('New');
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt to a Date', async () => {
      prisma.workspace.update.mockResolvedValue(baseWorkspace);
      await repo.softDelete('w1');
      const args = prisma.workspace.update.mock.calls[0][0] as {
        where: { id: string };
        data: { deletedAt: Date };
      };
      expect(args.where).toEqual({ id: 'w1' });
      expect(args.data.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('transferOwnership', () => {
    it('runs a transaction that demotes old owner, promotes new, and updates ownerId', async () => {
      await repo.transferOwnership({
        workspaceId: 'w1',
        fromUserId: 'u-old',
        toUserId: 'u-new',
        ownerRoleId: 'r-owner',
        adminRoleId: 'r-admin',
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const ops = prisma.$transaction.mock.calls[0][0] as unknown[];
      expect(ops).toHaveLength(3);
      expect(prisma.workspaceMember.update).toHaveBeenNthCalledWith(1, {
        where: { userId_workspaceId: { userId: 'u-old', workspaceId: 'w1' } },
        data: { roleId: 'r-admin' },
      });
      expect(prisma.workspaceMember.update).toHaveBeenNthCalledWith(2, {
        where: { userId_workspaceId: { userId: 'u-new', workspaceId: 'w1' } },
        data: { roleId: 'r-owner' },
      });
      expect(prisma.workspace.update).toHaveBeenCalledWith({
        where: { id: 'w1' },
        data: { ownerId: 'u-new' },
      });
    });
  });
});
