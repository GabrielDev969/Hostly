import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { WorkspaceGuard, WorkspaceRequest } from './workspace.guard';
import {
  WorkspaceMembersRepository,
  WorkspaceMemberWithRelations,
} from '@modules/workspaces/repositories/workspace-members.repository.interface';

describe('WorkspaceGuard', () => {
  const buildMember = (
    overrides: Partial<WorkspaceMemberWithRelations> = {},
  ): WorkspaceMemberWithRelations => ({
    id: 'm1',
    userId: 'u1',
    workspaceId: 'w1',
    roleId: 'r1',
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
  let guard: WorkspaceGuard;

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
    guard = new WorkspaceGuard(members);
  });

  it('attaches workspace context and permissions when user is a direct member', async () => {
    const req: Partial<WorkspaceRequest> = {
      user: { id: 'u1' },
      headers: { 'x-workspace-id': 'w1' },
      params: {},
    };
    members.findByUserAndWorkspace.mockResolvedValue(buildMember());

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);

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

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);

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

    await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(ForbiddenException);
    expect(req.workspace).toBeUndefined();
  });
});
