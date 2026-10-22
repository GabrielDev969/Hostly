import { ConflictException, NotFoundException } from '@nestjs/common';
import { SendInvitationUseCase } from './send-invitation.use-case';
import { InvitationsRepository } from '../repositories/invitations.repository.interface';
import { RolesRepository } from '@modules/rbac/repositories/roles.repository.interface';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { WorkspaceMembersRepository } from '@modules/workspaces/repositories/workspace-members.repository.interface';
import { User } from '@modules/users/entities/user.entity';
import { WorkspaceMemberWithRelations } from '@modules/workspaces/repositories/workspace-members.repository.interface';
import { WorkspacesRepository } from '@modules/workspaces/repositories/workspaces.repository.interface';
import { EmailDispatcher } from '@shared/mailer/email-dispatcher.service';

describe('SendInvitationUseCase', () => {
  let invitations: jest.Mocked<InvitationsRepository>;
  let roles: jest.Mocked<RolesRepository>;
  let users: jest.Mocked<UsersRepository>;
  let members: jest.Mocked<WorkspaceMembersRepository>;
  let workspaces: jest.Mocked<WorkspacesRepository>;
  let emailDispatcher: jest.Mocked<EmailDispatcher>;
  let useCase: SendInvitationUseCase;

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
    roles = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdInWorkspace: jest.fn(),
      findManyByWorkspace: jest.fn(),
      findByNameInWorkspace: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      countMembersUsingRole: jest.fn(),
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
      findManyByWorkspace: jest.fn(),
      updateRole: jest.fn(),
      delete: jest.fn(),
      countByWorkspace: jest.fn(),
      findManyByWorkspaceWithRelations: jest.fn(),
    };
    workspaces = {
      findById: jest.fn().mockResolvedValue({ id: 'w1', name: 'Acme' }),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    emailDispatcher = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EmailDispatcher>;
    useCase = new SendInvitationUseCase(
      invitations,
      roles,
      users,
      members,
      workspaces,
      emailDispatcher,
    );
  });

  const role = {
    id: 'r1',
    name: 'Editor',
    description: null,
    workspaceId: 'w1',
    isSystem: false,
    permissions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const input = {
    workspaceId: 'w1',
    email: 'newbie@example.com',
    roleId: 'r1',
    invitedById: 'inviter',
  };

  it('persists only the token hash and returns the raw token, with 7-day TTL', async () => {
    roles.findByIdInWorkspace.mockResolvedValue(role);
    users.findByEmail.mockResolvedValue(null);
    invitations.findPendingByEmailAndWorkspace.mockResolvedValue(null);
    invitations.create.mockImplementation((data) =>
      Promise.resolve({
        id: 'i1',
        ...data,
        acceptedAt: null,
        createdAt: new Date(),
      }),
    );

    const result = await useCase.execute(input);

    const createArg = invitations.create.mock.calls[0]![0];
    expect(createArg.email).toBe(input.email);
    expect(createArg.workspaceId).toBe(input.workspaceId);
    expect(createArg.roleId).toBe(input.roleId);
    expect(createArg.invitedById).toBe(input.invitedById);
    expect(createArg.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
    expect(result.token).not.toBe(createArg.tokenHash);
    const { CryptoUtil } = require('@shared/utils/crypto.util') as {
      CryptoUtil: { hashToken(t: string): string };
    };
    expect(CryptoUtil.hashToken(result.token as string)).toBe(createArg.tokenHash);

    const ttlMs = createArg.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
  });

  it('throws 404 when the role is not in the workspace', async () => {
    roles.findByIdInWorkspace.mockResolvedValue(null);

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(NotFoundException);
    expect(invitations.create).not.toHaveBeenCalled();
  });

  it('throws 409 when the user is already a member of the workspace', async () => {
    roles.findByIdInWorkspace.mockResolvedValue(role);
    users.findByEmail.mockResolvedValue({ id: 'u2' } as User);
    members.findByUserAndWorkspace.mockResolvedValue({
      id: 'm1',
    } as WorkspaceMemberWithRelations);

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ConflictException);
    expect(invitations.create).not.toHaveBeenCalled();
  });

  it('throws 409 when there is already a pending invitation', async () => {
    roles.findByIdInWorkspace.mockResolvedValue(role);
    users.findByEmail.mockResolvedValue(null);
    invitations.findPendingByEmailAndWorkspace.mockResolvedValue({
      id: 'i-existing',
    } as Awaited<ReturnType<InvitationsRepository['findPendingByEmailAndWorkspace']>>);

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ConflictException);
    expect(invitations.create).not.toHaveBeenCalled();
  });
});
