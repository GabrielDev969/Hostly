import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AcceptInvitationUseCase } from './accept-invitation.use-case';
import { InvitationsRepository } from '../repositories/invitations.repository.interface';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { WorkspaceMembersRepository } from '@modules/workspaces/repositories/workspace-members.repository.interface';
import {
  RolesRepository,
  RoleWithPermissions,
} from '@modules/rbac/repositories/roles.repository.interface';
import { Permission } from '@modules/rbac/entities/permission.entity';
import { Invitation } from '../entities/invitation.entity';
import { User } from '@modules/users/entities/user.entity';

describe('AcceptInvitationUseCase', () => {
  let invitations: jest.Mocked<InvitationsRepository>;
  let users: jest.Mocked<UsersRepository>;
  let members: jest.Mocked<WorkspaceMembersRepository>;
  let roles: jest.Mocked<RolesRepository>;
  let useCase: AcceptInvitationUseCase;

  const baseInvitation = (overrides: Partial<Invitation> = {}): Invitation => ({
    id: 'i1',
    email: 'invited@example.com',
    workspaceId: 'w1',
    roleId: 'r1',
    invitedById: 'inviter',
    clientId: null,
    tokenHash: 'hash',
    expiresAt: new Date(Date.now() + 60_000),
    acceptedAt: null,
    createdAt: new Date(),
    ...overrides,
  });

  const baseUser = (overrides: Partial<User> = {}): User => ({
    id: 'u1',
    email: 'invited@example.com',
    name: 'User',
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
    ...overrides,
  });

  const baseRole = (overrides: Partial<RoleWithPermissions> = {}): RoleWithPermissions => ({
    id: 'r1',
    name: 'Editor',
    description: null,
    workspaceId: 'w1',
    isSystem: false,
    permissions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const createdMember = {
    status: 'created' as const,
    member: {
      id: 'm1',
      userId: 'u1',
      workspaceId: 'w1',
      roleId: 'r1',
      clientId: null,
      advertiserId: null,
      joinedAt: new Date(),
    },
  };

  const pendingFor = (invitation: Invitation) => {
    invitations.findByTokenHash.mockResolvedValue(invitation);
    users.findById.mockResolvedValue(baseUser());
    members.findByUserAndWorkspace.mockResolvedValue(null);
  };

  beforeEach(() => {
    invitations = {
      create: jest.fn(),
      findById: jest.fn(),
      findByTokenHash: jest.fn(),
      findManyByWorkspace: jest.fn(),
      findPendingByEmailAndWorkspace: jest.fn(),
      delete: jest.fn(),
    };
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
    members = {
      create: jest.fn(),
      createFromInvitation: jest.fn().mockResolvedValue(createdMember),
      findById: jest.fn(),
      findByUserAndWorkspace: jest.fn(),
      findSuperAdminMembership: jest.fn(),
      updateRole: jest.fn(),
      delete: jest.fn(),
      findManyByWorkspaceWithRelations: jest.fn(),
    };
    roles = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdInWorkspace: jest.fn().mockResolvedValue(baseRole()),
      findManyByWorkspace: jest.fn(),
      findByNameInWorkspace: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      countMembersUsingRole: jest.fn(),
      findMembershipScopesUsingRole: jest.fn(),
    };
    useCase = new AcceptInvitationUseCase(invitations, users, members, roles);
  });

  it('creates the membership and closes the invitation in one step', async () => {
    pendingFor(baseInvitation());

    const result = await useCase.execute({ token: 'tok', userId: 'u1' });

    expect(result).toEqual({ workspaceId: 'w1', roleId: 'r1' });
    expect(roles.findByIdInWorkspace).toHaveBeenCalledWith('r1', 'w1');
    expect(members.createFromInvitation).toHaveBeenCalledWith({
      invitationId: 'i1',
      userId: 'u1',
      workspaceId: 'w1',
      roleId: 'r1',
      clientId: null,
      now: expect.any(Date) as Date,
    });
  });

  it("puts the new membership in the invitation's client", async () => {
    pendingFor(baseInvitation({ clientId: 'client-a' }));
    roles.findByIdInWorkspace.mockResolvedValue(
      baseRole({ name: 'client_editor', isSystem: true }),
    );

    await useCase.execute({ token: 'tok', userId: 'u1' });

    expect(members.createFromInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'client-a' }),
    );
  });

  it('throws 409 when the role of the invitation no longer exists', async () => {
    pendingFor(baseInvitation());
    roles.findByIdInWorkspace.mockResolvedValue(null);

    await expect(useCase.execute({ token: 'tok', userId: 'u1' })).rejects.toThrow(
      new ConflictException('The role of this invitation no longer exists'),
    );
    expect(members.createFromInvitation).not.toHaveBeenCalled();
  });

  it('throws 400 when the role grew past the ceiling of a client membership', async () => {
    pendingFor(baseInvitation({ clientId: 'client-a' }));
    roles.findByIdInWorkspace.mockResolvedValue(
      baseRole({ permissions: [{ key: 'user:read' } as Permission] }),
    );

    await expect(useCase.execute({ token: 'tok', userId: 'u1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(members.createFromInvitation).not.toHaveBeenCalled();
  });

  it('throws 400 when an operator role is now attached to a client invitation', async () => {
    pendingFor(baseInvitation({ clientId: 'client-a' }));
    roles.findByIdInWorkspace.mockResolvedValue(
      baseRole({ name: 'operator_admin', isSystem: true }),
    );

    await expect(useCase.execute({ token: 'tok', userId: 'u1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(members.createFromInvitation).not.toHaveBeenCalled();
  });

  it('throws 409 when the client was deleted after the invitation was sent', async () => {
    pendingFor(baseInvitation({ clientId: 'client-a' }));
    roles.findByIdInWorkspace.mockResolvedValue(
      baseRole({ name: 'client_editor', isSystem: true }),
    );
    members.createFromInvitation.mockResolvedValue({ status: 'client_gone' });

    await expect(useCase.execute({ token: 'tok', userId: 'u1' })).rejects.toThrow(
      new ConflictException('The client of this invitation no longer exists'),
    );
  });

  it('throws 400 when the invitation stopped being pending while accepting', async () => {
    pendingFor(baseInvitation());
    members.createFromInvitation.mockResolvedValue({ status: 'not_pending' });

    await expect(useCase.execute({ token: 'tok', userId: 'u1' })).rejects.toThrow(
      new BadRequestException('Invitation is no longer pending'),
    );
  });

  it('throws 404 when token is invalid', async () => {
    invitations.findByTokenHash.mockResolvedValue(null);

    await expect(useCase.execute({ token: 'bad', userId: 'u1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws 400 when invitation is expired', async () => {
    invitations.findByTokenHash.mockResolvedValue(
      baseInvitation({ expiresAt: new Date(Date.now() - 60_000) }),
    );

    await expect(useCase.execute({ token: 'tok', userId: 'u1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(members.createFromInvitation).not.toHaveBeenCalled();
  });

  it('throws 400 when invitation was already accepted', async () => {
    invitations.findByTokenHash.mockResolvedValue(baseInvitation({ acceptedAt: new Date() }));

    await expect(useCase.execute({ token: 'tok', userId: 'u1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws 404 when authenticated user no longer exists', async () => {
    invitations.findByTokenHash.mockResolvedValue(baseInvitation());
    users.findById.mockResolvedValue(null);
    await expect(useCase.execute({ token: 'tok', userId: 'gone' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(members.createFromInvitation).not.toHaveBeenCalled();
  });

  it('throws 403 when logged-in email differs from invitation email', async () => {
    invitations.findByTokenHash.mockResolvedValue(baseInvitation());
    users.findById.mockResolvedValue(baseUser({ email: 'other@example.com' }));

    await expect(useCase.execute({ token: 'tok', userId: 'u1' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(members.createFromInvitation).not.toHaveBeenCalled();
  });

  it('throws 409 when user is already a member of the workspace', async () => {
    invitations.findByTokenHash.mockResolvedValue(baseInvitation());
    users.findById.mockResolvedValue(baseUser());
    members.findByUserAndWorkspace.mockResolvedValue({
      id: 'm1',
    } as Awaited<ReturnType<WorkspaceMembersRepository['findByUserAndWorkspace']>>);

    await expect(useCase.execute({ token: 'tok', userId: 'u1' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
