import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkspaceGuard, WorkspaceRequest } from './workspace.guard';
import {
  WorkspaceMembersRepository,
  WorkspaceMemberWithRelations,
} from '@modules/workspaces/repositories/workspace-members.repository.interface';
import { WorkspacesRepository } from '@modules/workspaces/repositories/workspaces.repository.interface';
import { TenantContext } from '@shared/tenancy/tenant-context';

describe('WorkspaceGuard', () => {
  const buildMember = (
    overrides: Partial<WorkspaceMemberWithRelations> = {},
  ): WorkspaceMemberWithRelations => ({
    id: 'm1',
    userId: 'u1',
    workspaceId: 'w1',
    roleId: 'r1',
    clientId: null,
    advertiserId: null,
    organizationId: 'org1',
    joinedAt: new Date('2026-01-01'),
    role: {
      id: 'r1',
      name: 'Admin',
      isSystem: false,
      permissions: ['user:read', 'user:create'],
    },
    ...overrides,
  });

  const makeContext = (req: Partial<WorkspaceRequest>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    }) as unknown as ExecutionContext;

  let members: jest.Mocked<WorkspaceMembersRepository>;
  let workspaces: jest.Mocked<WorkspacesRepository>;
  let guard: WorkspaceGuard;

  const activate = (req: Partial<WorkspaceRequest>) =>
    TenantContext.run(async () => {
      const allowed = await guard.canActivate(makeContext(req));
      return { allowed, scope: TenantContext.scope };
    });

  beforeEach(() => {
    members = {
      create: jest.fn(),
      findById: jest.fn(),
      findByUserAndWorkspace: jest.fn(),
      findSuperAdminMembership: jest.fn(),
      findManyByWorkspace: jest.fn(),
      updateRole: jest.fn(),
      delete: jest.fn(),
      countByWorkspace: jest.fn(),
      findManyByWorkspaceWithRelations: jest.fn(),
    };
    workspaces = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    guard = new WorkspaceGuard(members, workspaces);
  });

  it('attaches workspace context and permissions when user is a direct member', async () => {
    const req: Partial<WorkspaceRequest> = {
      user: { id: 'u1' },
      headers: { 'x-workspace-id': 'w1' },
      params: {},
    };
    members.findByUserAndWorkspace.mockResolvedValue(buildMember());

    const { allowed, scope } = await activate(req);
    expect(allowed).toBe(true);
    const expectedScope = {
      organizationId: 'org1',
      workspaceId: 'w1',
      clientId: null,
      advertiserId: null,
    };
    expect(scope).toEqual(expectedScope);
    expect(req.scope).toEqual(expectedScope);

    expect(members.findByUserAndWorkspace).toHaveBeenCalledWith('u1', 'w1');
    expect(members.findSuperAdminMembership).not.toHaveBeenCalled();
    expect(req.workspace).toEqual({
      id: 'w1',
      member: { id: 'm1', userId: 'u1', workspaceId: 'w1', roleId: 'r1' },
      role: { id: 'r1', name: 'Admin', isSystem: false },
    });
    expect(req.permissions).toEqual(['user:read', 'user:create']);
  });

  it('falls back to super admin membership when not a direct member of the target workspace', async () => {
    const req: Partial<WorkspaceRequest> = {
      user: { id: 'super1' },
      headers: { 'x-workspace-id': 'w-other' },
      params: {},
    };
    members.findByUserAndWorkspace.mockResolvedValue(null);
    members.findSuperAdminMembership.mockResolvedValue(
      buildMember({
        id: 'm-super',
        userId: 'super1',
        workspaceId: 'w-admin',
        role: {
          id: 'r-super',
          name: 'SuperAdmin',
          isSystem: true,
          permissions: ['*'],
        },
      }),
    );

    workspaces.findById.mockResolvedValue({ id: 'w-other', organizationId: 'org-other' } as never);

    const { allowed, scope } = await activate(req);
    expect(allowed).toBe(true);
    expect(scope).toEqual({
      organizationId: 'org-other',
      workspaceId: 'w-other',
      clientId: null,
      advertiserId: null,
    });

    expect(members.findSuperAdminMembership).toHaveBeenCalledWith('super1');
    expect(req.workspace?.id).toBe('w-other');
    expect(req.workspace?.role.name).toBe('SuperAdmin');
    expect(req.permissions).toEqual(['*']);
  });

  it('throws Forbidden when the user is neither a member nor super admin', async () => {
    const req: Partial<WorkspaceRequest> = {
      user: { id: 'u1' },
      headers: { 'x-workspace-id': 'w1' },
      params: {},
    };
    members.findByUserAndWorkspace.mockResolvedValue(null);
    members.findSuperAdminMembership.mockResolvedValue(null);

    await expect(activate(req)).rejects.toBeInstanceOf(ForbiddenException);
    expect(req.workspace).toBeUndefined();
  });

  it('scopes client and advertiser members to their own ids', async () => {
    const req: Partial<WorkspaceRequest> = {
      user: { id: 'u1' },
      headers: { 'x-workspace-id': 'w1' },
      params: {},
    };
    members.findByUserAndWorkspace.mockResolvedValue(
      buildMember({ clientId: 'client-a', advertiserId: 'adv-1' }),
    );

    const { scope } = await activate(req);

    expect(scope).toEqual({
      organizationId: 'org1',
      workspaceId: 'w1',
      clientId: 'client-a',
      advertiserId: 'adv-1',
    });
  });

  it('rejects a super admin targeting a workspace that does not exist', async () => {
    const req: Partial<WorkspaceRequest> = {
      user: { id: 'super1' },
      headers: { 'x-workspace-id': 'missing' },
      params: {},
    };
    members.findByUserAndWorkspace.mockResolvedValue(null);
    members.findSuperAdminMembership.mockResolvedValue(buildMember({ userId: 'super1' }));
    workspaces.findById.mockResolvedValue(null);

    await expect(activate(req)).rejects.toBeInstanceOf(NotFoundException);
  });
});
