import { createCache } from 'cache-manager';
import { PrismaService } from '@shared/database/prisma.service';
import { ScopedPrismaService } from '@shared/tenancy/scoped-prisma.service';
import { CacheService } from '@shared/cache/cache.service';
import { PrismaWorkspaceMembersRepository } from './prisma-workspace-members.repository';
import { ADMIN_WORKSPACE_SLUG } from '@modules/rbac/constants/system';

type MemberClient = {
  create: jest.Mock;
  findUnique: jest.Mock;
  findMany: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  count: jest.Mock;
};

type WorkspaceClient = { findUnique: jest.Mock };

type PrismaMock = { workspaceMember: MemberClient; workspace: WorkspaceClient };

describe('PrismaWorkspaceMembersRepository', () => {
  let prisma: PrismaMock;
  let repo: PrismaWorkspaceMembersRepository;

  const baseMember = {
    id: 'm1',
    userId: 'u1',
    workspaceId: 'w1',
    roleId: 'r1',
    clientId: null,
    advertiserId: null,
    joinedAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    prisma = {
      workspaceMember: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      workspace: {
        findUnique: jest.fn(),
      },
    };
    repo = new PrismaWorkspaceMembersRepository(
      prisma as unknown as PrismaService,
      { client: prisma } as unknown as ScopedPrismaService,
      new CacheService(createCache()),
    );
  });

  describe('with cache enabled — exercises @Cacheable key arrows', () => {
    it('cached lookups serve from cache on repeat call', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue({
        ...baseMember,
        workspace: { organizationId: 'org1' },
        role: { id: 'r1', name: 'SuperAdmin', isSystem: true, permissions: [] },
      });
      await repo.findByUserAndWorkspace('u1', 'w1');
      await repo.findByUserAndWorkspace('u1', 'w1');
      expect(prisma.workspaceMember.findUnique).toHaveBeenCalledTimes(1);

      prisma.workspace.findUnique.mockResolvedValue({ id: 'admin-ws' });
      await repo.findSuperAdminMembership('u2');
      await repo.findSuperAdminMembership('u2');
      // findUnique on workspace is hit once for admin lookup; member findUnique
      // is hit again for the inner findByUserAndWorkspace, then cached
      expect(prisma.workspace.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe('create', () => {
    it('persists and returns mapped entity', async () => {
      prisma.workspaceMember.create.mockResolvedValue(baseMember);
      const result = await repo.create({
        userId: 'u1',
        workspaceId: 'w1',
        roleId: 'r1',
      });
      expect(prisma.workspaceMember.create).toHaveBeenCalledWith({
        data: { userId: 'u1', workspaceId: 'w1', roleId: 'r1' },
      });
      expect(result).toEqual(baseMember);
    });
  });

  describe('findById', () => {
    it('returns mapped member when found', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue(baseMember);
      const result = await repo.findById('m1');
      expect(prisma.workspaceMember.findUnique).toHaveBeenCalledWith({
        where: { id: 'm1' },
      });
      expect(result).toEqual(baseMember);
    });

    it('returns null when not found', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue(null);
      expect(await repo.findById('m-x')).toBeNull();
    });
  });

  describe('findByUserAndWorkspace', () => {
    it('returns mapped membership with role + permission keys', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue({
        ...baseMember,
        workspace: { organizationId: 'org1' },
        role: {
          id: 'r1',
          name: 'Owner',
          isSystem: true,
          permissions: [
            { permission: { key: 'user:read' } },
            { permission: { key: 'user:create' } },
          ],
        },
      });

      const result = await repo.findByUserAndWorkspace('u1', 'w1');
      expect(prisma.workspaceMember.findUnique).toHaveBeenCalledWith({
        where: { userId_workspaceId: { userId: 'u1', workspaceId: 'w1' } },
        include: {
          workspace: { select: { organizationId: true } },
          role: { include: { permissions: { include: { permission: true } } } },
        },
      });
      expect(result).toEqual({
        ...baseMember,
        organizationId: 'org1',
        role: {
          id: 'r1',
          name: 'Owner',
          isSystem: true,
          permissions: ['user:read', 'user:create'],
        },
      });
    });

    it('returns null when membership is missing', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue(null);
      expect(await repo.findByUserAndWorkspace('u1', 'w1')).toBeNull();
    });
  });

  describe('findSuperAdminMembership', () => {
    it('returns null when admin workspace does not exist', async () => {
      prisma.workspace.findUnique.mockResolvedValue(null);
      expect(await repo.findSuperAdminMembership('u1')).toBeNull();
    });

    it('queries admin workspace and delegates to findByUserAndWorkspace', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ id: 'admin-ws' });
      prisma.workspaceMember.findUnique.mockResolvedValue({
        ...baseMember,
        workspaceId: 'admin-ws',
        workspace: { organizationId: 'org-admin' },
        role: {
          id: 'sa',
          name: 'SuperAdmin',
          isSystem: true,
          permissions: [{ permission: { key: 'user:read' } }],
        },
      });

      const result = await repo.findSuperAdminMembership('u1');
      expect(prisma.workspace.findUnique).toHaveBeenCalledWith({
        where: { slug: ADMIN_WORKSPACE_SLUG },
        select: { id: true },
      });
      expect(result?.role.name).toBe('SuperAdmin');
    });

    it('ignores any other role held in the admin workspace', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ id: 'admin-ws' });
      prisma.workspaceMember.findUnique.mockResolvedValue({
        ...baseMember,
        workspaceId: 'admin-ws',
        workspace: { organizationId: 'org-admin' },
        role: { id: 'r-other', name: 'operator_staff', isSystem: true, permissions: [] },
      });

      expect(await repo.findSuperAdminMembership('u1')).toBeNull();
    });
  });

  describe('findManyByWorkspaceWithRelations', () => {
    it('includes user and role and filters out soft-deleted users', async () => {
      prisma.workspaceMember.findMany.mockResolvedValue([
        {
          ...baseMember,
          user: { id: 'u1', email: 'a@x.com', name: 'A' },
          role: { id: 'r1', name: 'Owner', isSystem: true },
        },
      ]);
      const result = await repo.findManyByWorkspaceWithRelations('w1');
      expect(prisma.workspaceMember.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'w1', user: { deletedAt: null } },
        include: {
          user: { select: { id: true, email: true, name: true } },
          role: { select: { id: true, name: true, isSystem: true } },
        },
        orderBy: { joinedAt: 'asc' },
      });
      expect(result[0]!.user.email).toBe('a@x.com');
      expect(result[0]!.role.name).toBe('Owner');
    });
  });

  describe('updateRole', () => {
    it('updates roleId and returns mapped entity', async () => {
      prisma.workspaceMember.update.mockResolvedValue({
        ...baseMember,
        roleId: 'r2',
      });
      const result = await repo.updateRole('m1', 'r2');
      expect(prisma.workspaceMember.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { roleId: 'r2' },
      });
      expect(result.roleId).toBe('r2');
    });
  });

  describe('delete', () => {
    it('removes membership by id', async () => {
      prisma.workspaceMember.delete.mockResolvedValue(baseMember);
      await repo.delete('m1');
      expect(prisma.workspaceMember.delete).toHaveBeenCalledWith({
        where: { id: 'm1' },
      });
    });
  });
});
