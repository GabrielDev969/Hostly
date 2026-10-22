import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DeleteUserUseCase } from './delete-user.use-case';
import { UsersRepository } from '../repositories/users.repository.interface';
import { WorkspacesRepository } from '@modules/workspaces/repositories/workspaces.repository.interface';
import { User } from '../entities/user.entity';
import { Workspace } from '@modules/workspaces/entities/workspace.entity';

describe('DeleteUserUseCase', () => {
  let users: jest.Mocked<UsersRepository>;
  let workspaces: jest.Mocked<WorkspacesRepository>;
  let useCase: DeleteUserUseCase;

  const targetUser = { id: 'u1' } as User;
  const baseWorkspace = (ownerId: string): Workspace => ({
    id: 'w1',
    name: 'W',
    slug: 'w',
    isPersonal: false,
    ownerId,
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
      update: jest.fn(),
      softDelete: jest.fn(),
      transferOwnership: jest.fn(),
    };
    useCase = new DeleteUserUseCase(users, workspaces);
  });

  it('soft-deletes a non-owner user from the workspace', async () => {
    users.findByIdInWorkspace.mockResolvedValue(targetUser);
    workspaces.findById.mockResolvedValue(baseWorkspace('owner-id'));

    await useCase.execute({ id: 'u1', workspaceId: 'w1' });

    expect(users.softDelete).toHaveBeenCalledWith('u1');
  });

  it('throws 404 when user is not in the workspace', async () => {
    users.findByIdInWorkspace.mockResolvedValue(null);

    await expect(useCase.execute({ id: 'u1', workspaceId: 'w1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(users.softDelete).not.toHaveBeenCalled();
  });

  it('forbids deleting the workspace owner', async () => {
    users.findByIdInWorkspace.mockResolvedValue(targetUser);
    workspaces.findById.mockResolvedValue(baseWorkspace('u1'));

    await expect(useCase.execute({ id: 'u1', workspaceId: 'w1' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(users.softDelete).not.toHaveBeenCalled();
  });
});
