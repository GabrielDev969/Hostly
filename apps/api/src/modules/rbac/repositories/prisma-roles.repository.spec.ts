import { createCache } from 'cache-manager';
import { PrismaService } from '@shared/database/prisma.service';
import { ScopedPrismaService } from '@shared/tenancy/scoped-prisma.service';
import { CacheService } from '@shared/cache/cache.service';
import { PrismaRolesRepository } from './prisma-roles.repository';
import { UnknownPermissionsError } from '../errors/unknown-permissions.error';

type PermissionClient = { findMany: jest.Mock };
type RoleClient = {
  create: jest.Mock;
  findUnique: jest.Mock;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  findUniqueOrThrow: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
};
type RolePermissionClient = {
  deleteMany: jest.Mock;
  createMany: jest.Mock;
};
type WorkspaceMemberClient = { count: jest.Mock };

type Tx = {
  permission: PermissionClient;
  role: RoleClient;
  rolePermission: RolePermissionClient;
};

type ScopedMock = {
  role: RoleClient;
  $transaction: jest.Mock;
};

type RawMock = {
  role: { delete: jest.Mock };
  invitation: { deleteMany: jest.Mock };
  workspaceMember: WorkspaceMemberClient;
  $transaction: jest.Mock;
};

const baseRoleRow = {
  id: 'r1',
  name: 'Admin',
  description: 'Administrator',
  workspaceId: 'w1',
  isSystem: false,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
  permissions: [
    {
      permission: {
        id: 'p1',
        key: 'user:read',
        description: null,
        category: 'user',
      },
    },
  ],
};

describe('PrismaRolesRepository', () => {
  let prisma: ScopedMock;
  let raw: RawMock;
  let tx: Tx;
  let repo: PrismaRolesRepository;

  beforeEach(() => {
    tx = {
      permission: { findMany: jest.fn() },
      role: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      rolePermission: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };
    prisma = {
      role: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (txArg: Tx) => Promise<unknown>) => fn(tx)),
    };
    raw = {
      role: { delete: jest.fn() },
      invitation: { deleteMany: jest.fn() },
      workspaceMember: { count: jest.fn() },
      $transaction: jest.fn(),
    };
    repo = new PrismaRolesRepository(
      raw as unknown as PrismaService,
      { client: prisma } as unknown as ScopedPrismaService,
      new CacheService(createCache()),
    );
  });

  describe('create', () => {
    beforeEach(() => {
      tx.role.create.mockResolvedValue({ id: 'r1' });
      tx.role.findUniqueOrThrow.mockResolvedValue(baseRoleRow);
    });

    it('creates the role, then links its permissions without a nested write', async () => {
      tx.permission.findMany.mockResolvedValue([{ id: 'p1', key: 'user:read' }]);

      const result = await repo.create({
        name: 'Admin',
        description: 'Administrator',
        workspaceId: 'w1',
        permissionKeys: ['user:read'],
      });

      expect(tx.permission.findMany).toHaveBeenCalledWith({
        where: {
          key: { in: ['user:read'] },
          OR: [{ workspaceId: null }, { workspaceId: 'w1' }],
        },
      });
      expect(tx.role.create).toHaveBeenCalledWith({
        data: {
          name: 'Admin',
          description: 'Administrator',
          workspaceId: 'w1',
          isSystem: false,
        },
      });
      expect(tx.rolePermission.createMany).toHaveBeenCalledWith({
        data: [{ roleId: 'r1', permissionId: 'p1' }],
      });
      expect(tx.role.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'r1' },
        include: { permissions: { include: { permission: true } } },
      });
      expect(result.id).toBe('r1');
      expect(result.permissions).toEqual([
        { id: 'p1', key: 'user:read', description: null, category: 'user' },
      ]);
    });

    it('respects isSystem when explicitly true', async () => {
      tx.permission.findMany.mockResolvedValue([{ id: 'p1', key: 'user:read' }]);

      await repo.create({
        name: 'Sys',
        workspaceId: 'w1',
        isSystem: true,
        permissionKeys: ['user:read'],
      });

      expect(tx.role.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isSystem: true }),
        }),
      );
    });

    it('throws UnknownPermissionsError listing missing permission keys', async () => {
      tx.permission.findMany.mockResolvedValue([{ id: 'p1', key: 'user:read' }]);

      const promise = repo.create({
        name: 'Admin',
        workspaceId: 'w1',
        permissionKeys: ['user:read', 'user:nuke', 'user:beam'],
      });
      await expect(promise).rejects.toBeInstanceOf(UnknownPermissionsError);
      await expect(promise).rejects.toMatchObject({
        missing: ['user:nuke', 'user:beam'],
      });
      expect(tx.role.create).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('returns mapped role with permissions', async () => {
      prisma.role.findUnique.mockResolvedValue(baseRoleRow);
      const result = await repo.findById('r1');
      expect(prisma.role.findUnique).toHaveBeenCalledWith({
        where: { id: 'r1' },
        include: { permissions: { include: { permission: true } } },
      });
      expect(result?.id).toBe('r1');
      expect(result?.permissions).toHaveLength(1);
    });

    it('returns null when not found', async () => {
      prisma.role.findUnique.mockResolvedValue(null);
      expect(await repo.findById('missing')).toBeNull();
    });
  });

  describe('findByIdInWorkspace', () => {
    it('returns mapped role scoped to the workspace', async () => {
      prisma.role.findFirst.mockResolvedValue(baseRoleRow);
      const result = await repo.findByIdInWorkspace('r1', 'w1');
      expect(prisma.role.findFirst).toHaveBeenCalledWith({
        where: { id: 'r1', workspaceId: 'w1' },
        include: { permissions: { include: { permission: true } } },
      });
      expect(result?.id).toBe('r1');
    });

    it('returns null when not found', async () => {
      prisma.role.findFirst.mockResolvedValue(null);
      expect(await repo.findByIdInWorkspace('r1', 'w1')).toBeNull();
    });
  });

  describe('findManyByWorkspace', () => {
    it('returns mapped roles ordered by isSystem desc then name asc', async () => {
      prisma.role.findMany.mockResolvedValue([baseRoleRow]);
      const result = await repo.findManyByWorkspace('w1');
      expect(prisma.role.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'w1' },
        include: { permissions: { include: { permission: true } } },
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      });
      expect(result).toHaveLength(1);
    });

    it('returns empty array when none', async () => {
      prisma.role.findMany.mockResolvedValue([]);
      expect(await repo.findManyByWorkspace('w1')).toEqual([]);
    });
  });

  describe('findByNameInWorkspace', () => {
    it('looks up by composite unique and returns mapped role', async () => {
      const { permissions: _omit, ...roleOnly } = baseRoleRow;
      void _omit;
      prisma.role.findUnique.mockResolvedValue(roleOnly);
      const result = await repo.findByNameInWorkspace('Admin', 'w1');
      expect(prisma.role.findUnique).toHaveBeenCalledWith({
        where: { workspaceId_name: { workspaceId: 'w1', name: 'Admin' } },
      });
      expect(result?.id).toBe('r1');
      expect(result).not.toHaveProperty('permissions');
    });

    it('returns null when not found', async () => {
      prisma.role.findUnique.mockResolvedValue(null);
      expect(await repo.findByNameInWorkspace('missing', 'w1')).toBeNull();
    });
  });

  describe('update', () => {
    it('updates name and description and returns mapped role', async () => {
      tx.role.findUniqueOrThrow.mockResolvedValue(baseRoleRow);

      await repo.update('r1', { name: 'NewName', description: 'New' });

      expect(tx.role.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { name: 'NewName', description: 'New' },
      });
      expect(tx.rolePermission.deleteMany).not.toHaveBeenCalled();
    });

    it('clears description when set to null', async () => {
      tx.role.findUniqueOrThrow.mockResolvedValue(baseRoleRow);

      await repo.update('r1', { description: undefined });

      // description undefined means no update branch should run
      expect(tx.role.update).not.toHaveBeenCalled();
    });

    it('replaces permissions atomically when permissionKeys provided', async () => {
      tx.permission.findMany.mockResolvedValue([
        { id: 'p1', key: 'user:read' },
        { id: 'p2', key: 'user:write' },
      ]);
      tx.role.findUniqueOrThrow.mockResolvedValue(baseRoleRow);

      const result = await repo.update('r1', {
        permissionKeys: ['user:read', 'user:write'],
      });

      expect(tx.rolePermission.deleteMany).toHaveBeenCalledWith({
        where: { roleId: 'r1' },
      });
      expect(tx.rolePermission.createMany).toHaveBeenCalledWith({
        data: [
          { roleId: 'r1', permissionId: 'p1' },
          { roleId: 'r1', permissionId: 'p2' },
        ],
      });
      expect(tx.role.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'r1' },
        include: { permissions: { include: { permission: true } } },
      });
      expect(result.id).toBe('r1');
    });

    it('throws UnknownPermissionsError when permission keys are unknown', async () => {
      tx.role.findUniqueOrThrow.mockResolvedValue(baseRoleRow);
      tx.permission.findMany.mockResolvedValue([{ id: 'p1', key: 'user:read' }]);

      const promise = repo.update('r1', {
        permissionKeys: ['user:read', 'user:beam'],
      });
      await expect(promise).rejects.toBeInstanceOf(UnknownPermissionsError);
      await expect(promise).rejects.toMatchObject({ missing: ['user:beam'] });
      expect(tx.rolePermission.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('removes its invitations, then the role, pinned to its workspace, in one transaction', async () => {
      raw.invitation.deleteMany.mockReturnValue('delete invitations');
      raw.role.delete.mockReturnValue('delete role');
      await repo.delete('r1', 'w1');
      expect(raw.invitation.deleteMany).toHaveBeenCalledWith({
        where: { roleId: 'r1', workspaceId: 'w1' },
      });
      expect(raw.role.delete).toHaveBeenCalledWith({ where: { id: 'r1', workspaceId: 'w1' } });
      expect(raw.$transaction).toHaveBeenCalledWith(['delete invitations', 'delete role']);
    });
  });

  describe('countMembersUsingRole', () => {
    it('counts workspace members for the given role', async () => {
      raw.workspaceMember.count.mockResolvedValue(3);
      const count = await repo.countMembersUsingRole('r1');
      expect(raw.workspaceMember.count).toHaveBeenCalledWith({
        where: { roleId: 'r1' },
      });
      expect(count).toBe(3);
    });
  });
});
