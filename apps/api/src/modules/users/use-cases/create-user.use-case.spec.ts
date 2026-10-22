import { ConflictException, NotFoundException } from '@nestjs/common';
import { CreateUserUseCase } from './create-user.use-case';
import { UsersRepository } from '../repositories/users.repository.interface';
import { WorkspaceMembersRepository } from '@modules/workspaces/repositories/workspace-members.repository.interface';
import { RolesRepository } from '@modules/rbac/repositories/roles.repository.interface';
import { CryptoUtil } from '@shared/utils/crypto.util';
import type { User } from '@modules/users/entities/user.entity';

describe('CreateUserUseCase', () => {
  let users: jest.Mocked<UsersRepository>;
  let members: jest.Mocked<WorkspaceMembersRepository>;
  let roles: jest.Mocked<RolesRepository>;
  let useCase: CreateUserUseCase;

  beforeEach(() => {
    users = {
      findByEmail: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
    members = {
      create: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceMembersRepository>;
    roles = {
      findByIdInWorkspace: jest.fn(),
    } as unknown as jest.Mocked<RolesRepository>;
    useCase = new CreateUserUseCase(users, members, roles);
  });

  it('throws ConflictException when email is already taken globally', async () => {
    users.findByEmail.mockResolvedValue({ id: 'existing' } as User);
    await expect(
      useCase.execute({
        workspaceId: 'w1',
        createdBy: 'admin',
        email: 'taken@x.com',
        name: 'X',
        password: 'StrongPass@123',
        roleId: 'r1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(users.create).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when role is not in the target workspace', async () => {
    users.findByEmail.mockResolvedValue(null);
    roles.findByIdInWorkspace.mockResolvedValue(null);
    await expect(
      useCase.execute({
        workspaceId: 'w1',
        createdBy: 'admin',
        email: 'jane@x.com',
        name: 'Jane',
        password: 'StrongPass@123',
        roleId: 'wrong-role',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(users.create).not.toHaveBeenCalled();
  });

  it('hashes the password, creates the user and adds them as a member', async () => {
    users.findByEmail.mockResolvedValue(null);
    roles.findByIdInWorkspace.mockResolvedValue({ id: 'r1' } as never);
    users.create.mockResolvedValue({
      id: 'u-new',
      email: 'jane@x.com',
      name: 'Jane',
      twoFactorEnabled: false,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    } as User);
    members.create.mockResolvedValue({} as never);

    const result = await useCase.execute({
      workspaceId: 'w1',
      createdBy: 'admin',
      email: 'jane@x.com',
      name: 'Jane',
      password: 'StrongPass@123',
      roleId: 'r1',
    });

    const createArg = users.create.mock.calls[0]![0];
    expect(createArg.email).toBe('jane@x.com');
    expect(createArg.name).toBe('Jane');
    await expect(
      CryptoUtil.verifyPassword(createArg.passwordHash!, 'StrongPass@123'),
    ).resolves.toBe(true);

    expect(members.create).toHaveBeenCalledWith({
      userId: 'u-new',
      workspaceId: 'w1',
      roleId: 'r1',
    });
    expect(result.id).toBe('u-new');
    expect(result.twoFactorEnabled).toBe(false);
  });
});
