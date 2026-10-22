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
import { Invitation } from '../entities/invitation.entity';
import { User } from '@modules/users/entities/user.entity';

describe('AcceptInvitationUseCase', () => {
  let invitations: jest.Mocked<InvitationsRepository>;
  let users: jest.Mocked<UsersRepository>;
  let members: jest.Mocked<WorkspaceMembersRepository>;
  let useCase: AcceptInvitationUseCase;

  const baseInvitation = (overrides: Partial<Invitation> = {}): Invitation => ({
    id: 'i1',
    email: 'invited@example.com',
    workspaceId: 'w1',
    roleId: 'r1',
    invitedById: 'inviter',
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

  beforeEach(() => {
    invitations = {
      create: jest.fn(),
      findById: jest.fn(),
      findByTokenHash: jest.fn(),
      findManyByWorkspace: jest.fn(),
      findPendingByEmailAndWorkspace: jest.fn(),
      markAsAccepted: jest.fn(),
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
      findById: jest.fn(),
      findByUserAndWorkspace: jest.fn(),
      findSuperAdminMembership: jest.fn(),
      updateRole: jest.fn(),
      delete: jest.fn(),
      findManyByWorkspaceWithRelations: jest.fn(),
    };
    useCase = new AcceptInvitationUseCase(invitations, users, members);
  });

  it('creates membership and marks invitation as accepted', async () => {
    invitations.findByTokenHash.mockResolvedValue(baseInvitation());
    users.findById.mockResolvedValue(baseUser());
    members.findByUserAndWorkspace.mockResolvedValue(null);

    const result = await useCase.execute({ token: 'tok', userId: 'u1' });

    expect(result).toEqual({ workspaceId: 'w1', roleId: 'r1' });
    expect(members.create).toHaveBeenCalledWith({
      userId: 'u1',
      workspaceId: 'w1',
      roleId: 'r1',
    });
    expect(invitations.markAsAccepted).toHaveBeenCalledWith('i1');
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
    expect(members.create).not.toHaveBeenCalled();
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
    expect(members.create).not.toHaveBeenCalled();
  });

  it('throws 403 when logged-in email differs from invitation email', async () => {
    invitations.findByTokenHash.mockResolvedValue(baseInvitation());
    users.findById.mockResolvedValue(baseUser({ email: 'other@example.com' }));

    await expect(useCase.execute({ token: 'tok', userId: 'u1' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(members.create).not.toHaveBeenCalled();
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
