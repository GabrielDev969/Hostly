import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceGuard, WorkspaceRequest } from './workspace.guard';
import {
  WorkspaceMembersRepository,
  WorkspaceMemberWithRelations,
} from '@modules/workspaces/repositories/workspace-members.repository.interface';
import { WorkspacesRepository } from '@modules/workspaces/repositories/workspaces.repository.interface';
import { TenantContext } from '@shared/tenancy/tenant-context';

describe('WorkspaceGuard', () => {
  const W1 = '11111111-1111-4111-8111-111111111111';
  const W_OTHER = '22222222-2222-4222-8222-222222222222';
  const MISSING = '33333333-3333-4333-8333-333333333333';

  const buildMember = (
    overrides: Partial<WorkspaceMemberWithRelations> = {},
  ): WorkspaceMemberWithRelations => ({
    id: 'm1',
    userId: 'u1',
    workspaceId: W1,
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
      updateRole: jest.fn(),
      delete: jest.fn(),
      findManyByWorkspaceWithRelations: jest.fn(),
      createFromInvitation: jest.fn(),
    };
    workspaces = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    guard = new WorkspaceGuard(members, workspaces);
  });

  it('attaches workspace context and permissions when user is a direct member', async () => {
    const req: Partial<WorkspaceRequest> = {
      user: { id: 'u1' },
      headers: { 'x-workspace-id': W1 },
      params: {},
    };
    members.findByUserAndWorkspace.mockResolvedValue(buildMember());

    const { allowed, scope } = await activate(req);
    expect(allowed).toBe(true);
    const expectedScope = {
      organizationId: 'org1',
      workspaceId: W1,
      clientId: null,
      advertiserId: null,
    };
    expect(scope).toEqual(expectedScope);
    expect(req.scope).toEqual(expectedScope);

    expect(members.findByUserAndWorkspace).toHaveBeenCalledWith('u1', W1);
    expect(members.findSuperAdminMembership).not.toHaveBeenCalled();
    expect(req.workspace).toEqual({
      id: W1,
      member: { id: 'm1', userId: 'u1', workspaceId: W1, roleId: 'r1' },
      role: { id: 'r1', name: 'Admin', isSystem: false },
    });
    expect(req.permissions).toEqual(['user:read', 'user:create']);
  });

  it('falls back to super admin membership when not a direct member of the target workspace', async () => {
    const req: Partial<WorkspaceRequest> = {
      user: { id: 'super1' },
      headers: { 'x-workspace-id': W_OTHER },
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

    workspaces.findById.mockResolvedValue({ id: W_OTHER, organizationId: 'org-other' } as never);

    const { allowed, scope } = await activate(req);
    expect(allowed).toBe(true);
    expect(scope).toEqual({
      organizationId: 'org-other',
      workspaceId: W_OTHER,
      clientId: null,
      advertiserId: null,
    });

    expect(members.findSuperAdminMembership).toHaveBeenCalledWith('super1');
    expect(req.workspace?.id).toBe(W_OTHER);
    expect(req.workspace?.role.name).toBe('SuperAdmin');
    expect(req.permissions).toEqual(['*']);
  });

  it('throws Forbidden when the user is neither a member nor super admin', async () => {
    const req: Partial<WorkspaceRequest> = {
      user: { id: 'u1' },
      headers: { 'x-workspace-id': W1 },
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
      headers: { 'x-workspace-id': W1 },
      params: {},
    };
    members.findByUserAndWorkspace.mockResolvedValue(
      buildMember({ clientId: 'client-a', advertiserId: 'adv-1' }),
    );

    const { scope } = await activate(req);

    expect(scope).toEqual({
      organizationId: 'org1',
      workspaceId: W1,
      clientId: 'client-a',
      advertiserId: 'adv-1',
    });
  });

  it('rejects a super admin targeting a workspace that does not exist', async () => {
    const req: Partial<WorkspaceRequest> = {
      user: { id: 'super1' },
      headers: { 'x-workspace-id': MISSING },
      params: {},
    };
    members.findByUserAndWorkspace.mockResolvedValue(null);
    members.findSuperAdminMembership.mockResolvedValue(buildMember({ userId: 'super1' }));
    workspaces.findById.mockResolvedValue(null);

    await expect(activate(req)).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('workspace in the header and in the URL', () => {
    const expectNoLookup = () => {
      expect(members.findByUserAndWorkspace).not.toHaveBeenCalled();
      expect(members.findSuperAdminMembership).not.toHaveBeenCalled();
      expect(workspaces.findById).not.toHaveBeenCalled();
    };

    it('refuses a header that differs from :workspaceId before any membership lookup', async () => {
      const req: Partial<WorkspaceRequest> = {
        user: { id: 'u1' },
        headers: { 'x-workspace-id': W_OTHER },
        params: { workspaceId: W1 },
      };
      members.findByUserAndWorkspace.mockResolvedValue(buildMember());

      await expect(activate(req)).rejects.toThrow(
        new BadRequestException('x-workspace-id does not match the workspace in the URL'),
      );
      expectNoLookup();
      expect(req.workspace).toBeUndefined();
      expect(req.scope).toBeUndefined();
    });

    it('refuses the mismatch for a super admin too, before superAdminScope', async () => {
      const req: Partial<WorkspaceRequest> = {
        user: { id: 'super1' },
        headers: { 'x-workspace-id': W_OTHER },
        params: { workspaceId: W1 },
      };
      members.findByUserAndWorkspace.mockResolvedValue(null);
      members.findSuperAdminMembership.mockResolvedValue(buildMember({ userId: 'super1' }));
      workspaces.findById.mockResolvedValue({ id: W_OTHER, organizationId: 'org-other' } as never);

      await expect(activate(req)).rejects.toBeInstanceOf(BadRequestException);
      expectNoLookup();
    });

    it.each([
      ['a repeated header joined by Node', { 'x-workspace-id': `${W1}, ${W_OTHER}` }, {}],
      ['a header array', { 'x-workspace-id': [W1, W_OTHER] }, {}],
      ['a header that is not a UUID', { 'x-workspace-id': 'not-a-uuid' }, {}],
      ['a static segment caught by :workspaceId', {}, { workspaceId: 'features' }],
      ['a static segment with a header', { 'x-workspace-id': W1 }, { workspaceId: 'features' }],
    ])('refuses %s with 400 and no lookup', async (_label, headers, params) => {
      const req = { user: { id: 'u1' }, headers, params } as Partial<WorkspaceRequest>;
      members.findByUserAndWorkspace.mockResolvedValue(buildMember());

      await expect(activate(req)).rejects.toBeInstanceOf(BadRequestException);
      expectNoLookup();
    });

    it.each([
      ['the header alone', { 'x-workspace-id': W1 }, {}],
      ['the path alone', {}, { workspaceId: W1 }],
      ['both, when they match', { 'x-workspace-id': W1 }, { workspaceId: W1 }],
    ])('accepts %s', async (_label, headers, params) => {
      const req = { user: { id: 'u1' }, headers, params } as Partial<WorkspaceRequest>;
      members.findByUserAndWorkspace.mockResolvedValue(buildMember());

      const { allowed } = await activate(req);

      expect(allowed).toBe(true);
      expect(members.findByUserAndWorkspace).toHaveBeenCalledWith('u1', W1);
      expect(req.workspace?.id).toBe(W1);
    });
  });
});
