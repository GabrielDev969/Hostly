import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { SuperAdminGuard } from './super-admin.guard';
import {
  WorkspaceMembersRepository,
  WorkspaceMemberWithRelations,
} from '@modules/workspaces/repositories/workspace-members.repository.interface';

describe('SuperAdminGuard', () => {
  const makeContext = (
    req: { user?: { id: string } } & Record<string, unknown>,
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    }) as unknown as ExecutionContext;

  let members: jest.Mocked<WorkspaceMembersRepository>;
  let guard: SuperAdminGuard;

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
    guard = new SuperAdminGuard(members);
  });

  it('throws Unauthorized when req.user is missing', async () => {
    await expect(guard.canActivate(makeContext({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws Forbidden when user has no super-admin membership', async () => {
    members.findSuperAdminMembership.mockResolvedValue(null);
    await expect(guard.canActivate(makeContext({ user: { id: 'u1' } }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(members.findSuperAdminMembership).toHaveBeenCalledWith('u1');
  });

  it('returns true when user has super-admin membership', async () => {
    const membership: WorkspaceMemberWithRelations = {
      id: 'm-sa',
      userId: 'u-sa',
      workspaceId: 'w-admin',
      roleId: 'r-sa',
      joinedAt: new Date(),
      role: {
        id: 'r-sa',
        name: 'SuperAdmin',
        isSystem: true,
        permissions: ['user:read'],
      },
    };
    members.findSuperAdminMembership.mockResolvedValue(membership);

    await expect(guard.canActivate(makeContext({ user: { id: 'u-sa' } }))).resolves.toBe(true);
  });
});
