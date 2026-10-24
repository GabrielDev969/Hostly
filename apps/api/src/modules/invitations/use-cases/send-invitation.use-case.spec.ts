import { inScope, OPERATOR_SCOPE } from '@test/helpers/tenant-scope';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SendInvitationUseCase } from './send-invitation.use-case';
import { InvitationsRepository } from '../repositories/invitations.repository.interface';
import { RolesRepository } from '@modules/rbac/repositories/roles.repository.interface';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { WorkspaceMembersRepository } from '@modules/workspaces/repositories/workspace-members.repository.interface';
import { User } from '@modules/users/entities/user.entity';
import { WorkspaceMemberWithRelations } from '@modules/workspaces/repositories/workspace-members.repository.interface';
import { WorkspacesRepository } from '@modules/workspaces/repositories/workspaces.repository.interface';
import { ClientsRepository } from '@modules/clients/repositories/clients.repository.interface';
import { Client } from '@modules/clients/entities/client.entity';
import { EmailDispatcher } from '@shared/mailer/email-dispatcher.service';

describe('SendInvitationUseCase', () => {
  let invitations: jest.Mocked<InvitationsRepository>;
  let roles: jest.Mocked<RolesRepository>;
  let users: jest.Mocked<UsersRepository>;
  let members: jest.Mocked<WorkspaceMembersRepository>;
  let workspaces: jest.Mocked<WorkspacesRepository>;
  let clients: jest.Mocked<ClientsRepository>;
  let emailDispatcher: jest.Mocked<EmailDispatcher>;
  let useCase: SendInvitationUseCase;

  beforeEach(() => {
    invitations = {
      create: jest.fn(),
      findById: jest.fn(),
      findByTokenHash: jest.fn(),
      findManyByWorkspace: jest.fn(),
      findPendingByEmailAndWorkspace: jest.fn(),
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
      findMembershipScopesUsingRole: jest.fn().mockResolvedValue([]),
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
      createFromInvitation: jest.fn(),
    };
    workspaces = {
      findById: jest.fn().mockResolvedValue({ id: 'w1', name: 'Acme' }),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    clients = {
      findMany: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDeleteUnlessUsed: jest.fn(),
    };
    emailDispatcher = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EmailDispatcher>;
    useCase = inScope(
      new SendInvitationUseCase(
        invitations,
        roles,
        users,
        members,
        workspaces,
        clients,
        emailDispatcher,
      ),
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
    clientId: null,
    invitedById: 'inviter',
  };

  it('persists only the token hash, emails the raw token and never returns it, with 7-day TTL', async () => {
    roles.findByIdInWorkspace.mockResolvedValue(role);
    users.findByEmail.mockResolvedValue(null);
    invitations.findPendingByEmailAndWorkspace.mockResolvedValue(null);
    invitations.create.mockImplementation((data) =>
      Promise.resolve({
        id: 'i1',
        organizationId: 'o1',
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

    // The raw token reaches the invitee only through the email link.
    const email = emailDispatcher.enqueue.mock.calls[0]![0];
    expect(email.to).toBe(input.email);
    const rawToken = new URL(email.text.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!;
    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
    expect(rawToken).not.toBe(createArg.tokenHash);
    const { CryptoUtil } = require('@shared/utils/crypto.util') as {
      CryptoUtil: { hashToken(t: string): string };
    };
    expect(CryptoUtil.hashToken(rawToken)).toBe(createArg.tokenHash);

    expect(result).not.toHaveProperty('token');
    expect(JSON.stringify(result)).not.toContain(rawToken);
    expect(JSON.stringify(result)).not.toContain(createArg.tokenHash);

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

  it('refuses invitations from client users (operator memberships need an operator grantor)', async () => {
    roles.findByIdInWorkspace.mockResolvedValue(role);
    const asClient = inScope(
      new SendInvitationUseCase(
        invitations,
        roles,
        users,
        members,
        workspaces,
        clients,
        emailDispatcher,
      ),
      { ...OPERATOR_SCOPE, clientId: 'client-a' },
    );

    await expect(asClient.execute(input)).rejects.toBeInstanceOf(ForbiddenException);
    expect(invitations.create).not.toHaveBeenCalled();
  });

  it('refuses a client role without a client', async () => {
    roles.findByIdInWorkspace.mockResolvedValue({ ...role, name: 'client_admin', isSystem: true });

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(BadRequestException);
    expect(invitations.create).not.toHaveBeenCalled();
  });

  describe('with a client', () => {
    const clientRole = { ...role, name: 'client_editor', isSystem: true };
    const clientInput = { ...input, clientId: 'client-a' };

    beforeEach(() => {
      users.findByEmail.mockResolvedValue(null);
      invitations.findPendingByEmailAndWorkspace.mockResolvedValue(null);
      invitations.create.mockImplementation((data) =>
        Promise.resolve({
          id: 'i1',
          organizationId: 'o1',
          ...data,
          acceptedAt: null,
          createdAt: new Date(),
        }),
      );
    });

    it('stores the client of a client-role invitation', async () => {
      roles.findByIdInWorkspace.mockResolvedValue(clientRole);
      clients.findById.mockResolvedValue({ id: 'client-a' } as Client);

      const result = await useCase.execute(clientInput);

      expect(clients.findById).toHaveBeenCalledWith('client-a');
      expect(invitations.create.mock.calls[0]![0].clientId).toBe('client-a');
      expect(result.clientId).toBe('client-a');
    });

    it('throws 404 when the client is not in scope (other organization or deleted)', async () => {
      roles.findByIdInWorkspace.mockResolvedValue(clientRole);
      clients.findById.mockResolvedValue(null);

      await expect(useCase.execute(clientInput)).rejects.toBeInstanceOf(NotFoundException);
      expect(invitations.create).not.toHaveBeenCalled();
    });

    it('throws 404 and sends no email when the client is deleted while inviting', async () => {
      roles.findByIdInWorkspace.mockResolvedValue(clientRole);
      clients.findById.mockResolvedValue({ id: 'client-a' } as Client);
      invitations.create.mockResolvedValue(null);

      await expect(useCase.execute(clientInput)).rejects.toThrow(
        new NotFoundException('Client not found'),
      );
      expect(emailDispatcher.enqueue).not.toHaveBeenCalled();
    });

    it('refuses an operator role with a client', async () => {
      roles.findByIdInWorkspace.mockResolvedValue({
        ...role,
        name: 'operator_staff',
        isSystem: true,
      });

      await expect(useCase.execute(clientInput)).rejects.toBeInstanceOf(BadRequestException);
      expect(invitations.create).not.toHaveBeenCalled();
    });
  });
});
