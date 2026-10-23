import { NotFoundException } from '@nestjs/common';
import { GetMeUseCase } from './get-me.use-case';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { WorkspacesRepository } from '@modules/workspaces/repositories/workspaces.repository.interface';
import { WorkspaceMembersRepository } from '@modules/workspaces/repositories/workspace-members.repository.interface';
import { User } from '@modules/users/entities/user.entity';
import { Workspace } from '@modules/workspaces/entities/workspace.entity';
import { ADMIN_WORKSPACE_SLUG } from '@modules/rbac/constants/system';

describe('GetMeUseCase', () => {
  let users: jest.Mocked<UsersRepository>;
  let workspaces: jest.Mocked<WorkspacesRepository>;
  let members: jest.Mocked<WorkspaceMembersRepository>;
  let useCase: GetMeUseCase;

  const baseUser: User = {
    id: 'u1',
    email: 'jane@example.com',
    name: 'Jane',
    passwordHash: 'h',
    twoFactorEnabled: false,
    twoFactorSecret: null,
    recoveryCodes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    emailVerifiedAt: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    tokensInvalidatedAt: null,
    anonymizedAt: null,
  };

  const ws = (slug: string): Workspace => ({
    id: slug,
    name: slug,
    slug,
    isPersonal: false,
    ownerId: 'u1',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    organizationId: 'org1',
  });

  beforeEach(() => {
    users = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdInWorkspace: jest.fn(),
      findByEmail: jest.fn(),
      findManyByWorkspace: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      anonymize: jest.fn(),
      findByEmailIncludingDeleted: jest.fn(),
      findPendingAnonymization: jest.fn(),
      incrementFailedLoginAttempts: jest.fn(),
      lockAccount: jest.fn(),
      resetFailedLoginAttempts: jest.fn(),
      findTokensInvalidatedAt: jest.fn(),
      invalidateTokens: jest.fn(),
    };
    workspaces = {
      createWithDefaults: jest.fn(),
      findById: jest.fn(),
      findBySlug: jest.fn(),
      findByUserId: jest.fn(),
      findOperatorWorkspaceId: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      transferOwnership: jest.fn(),
    };
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
    useCase = new GetMeUseCase(users, workspaces, members);
  });

  it('returns the user profile with isSuperAdmin=false and admin workspace filtered out', async () => {
    users.findById.mockResolvedValue(baseUser);
    workspaces.findByUserId.mockResolvedValue([
      ws('personal'),
      ws(ADMIN_WORKSPACE_SLUG),
      ws('acme'),
    ]);
    members.findSuperAdminMembership.mockResolvedValue(null);

    const result = await useCase.execute('u1');

    expect(result.id).toBe('u1');
    expect(result.email).toBe('jane@example.com');
    expect(result.isSuperAdmin).toBe(false);
    expect(result.workspaces).toHaveLength(2);
    expect(result.workspaces.map((w) => w.slug)).toEqual(['personal', 'acme']);
  });

  it('returns isSuperAdmin=true when user has membership in the admin workspace', async () => {
    users.findById.mockResolvedValue(baseUser);
    workspaces.findByUserId.mockResolvedValue([ws(ADMIN_WORKSPACE_SLUG)]);
    members.findSuperAdminMembership.mockResolvedValue({
      id: 'm-admin',
    } as Awaited<ReturnType<WorkspaceMembersRepository['findSuperAdminMembership']>>);

    const result = await useCase.execute('u1');

    expect(result.isSuperAdmin).toBe(true);
    expect(result.workspaces).toHaveLength(0);
  });

  it('does not leak password or 2FA secrets', async () => {
    users.findById.mockResolvedValue({
      ...baseUser,
      twoFactorSecret: 'enc-secret',
      recoveryCodes: '[]',
    });
    workspaces.findByUserId.mockResolvedValue([]);
    members.findSuperAdminMembership.mockResolvedValue(null);

    const result = (await useCase.execute('u1')) as unknown as Record<string, unknown>;

    expect(result.passwordHash).toBeUndefined();
    expect(result.twoFactorSecret).toBeUndefined();
    expect(result.recoveryCodes).toBeUndefined();
  });

  it('throws 404 when user does not exist', async () => {
    users.findById.mockResolvedValue(null);

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
