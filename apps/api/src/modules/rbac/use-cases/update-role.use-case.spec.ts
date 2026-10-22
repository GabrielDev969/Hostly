import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UpdateRoleUseCase } from './update-role.use-case';
import { RolesRepository } from '../repositories/roles.repository.interface';
import { UnknownPermissionsError } from '../errors/unknown-permissions.error';
import { Permission } from '../entities/permission.entity';
import { Role } from '../entities/role.entity';

describe('UpdateRoleUseCase', () => {
  let roles: jest.Mocked<RolesRepository>;
  let useCase: UpdateRoleUseCase;

  const baseRole = (overrides: Partial<{ name: string; isSystem: boolean }> = {}) => ({
    id: 'r1',
    name: 'Editor',
    description: null,
    workspaceId: 'w1',
    isSystem: false,
    permissions: [] as Permission[],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
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
    useCase = new UpdateRoleUseCase(roles);
  });

  it('updates name and description when there is no name conflict', async () => {
    roles.findByIdInWorkspace.mockResolvedValue(baseRole());
    roles.findByNameInWorkspace.mockResolvedValue(null);
    roles.update.mockResolvedValue(baseRole({ name: 'Senior Editor' }));

    await useCase.execute({
      id: 'r1',
      workspaceId: 'w1',
      name: 'Senior Editor',
      description: 'Updated',
    });

    expect(roles.update).toHaveBeenCalledWith('r1', {
      name: 'Senior Editor',
      description: 'Updated',
      permissionKeys: undefined,
    });
  });

  it('does not check name conflict when name is unchanged', async () => {
    roles.findByIdInWorkspace.mockResolvedValue(baseRole({ name: 'Editor' }));
    roles.update.mockResolvedValue(baseRole());

    await useCase.execute({
      id: 'r1',
      workspaceId: 'w1',
      name: 'Editor',
    });

    expect(roles.findByNameInWorkspace).not.toHaveBeenCalled();
  });

  it('throws 404 when role is not in the workspace', async () => {
    roles.findByIdInWorkspace.mockResolvedValue(null);

    await expect(
      useCase.execute({ id: 'r1', workspaceId: 'w1', name: 'Foo' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(roles.update).not.toHaveBeenCalled();
  });

  it('forbids modifying system roles', async () => {
    roles.findByIdInWorkspace.mockResolvedValue(baseRole({ isSystem: true }));

    await expect(
      useCase.execute({ id: 'r1', workspaceId: 'w1', name: 'Foo' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(roles.update).not.toHaveBeenCalled();
  });

  it('throws 409 when renaming to an existing role name', async () => {
    roles.findByIdInWorkspace.mockResolvedValue(baseRole({ name: 'Editor' }));
    roles.findByNameInWorkspace.mockResolvedValue({ id: 'r2' } as Role);

    await expect(
      useCase.execute({ id: 'r1', workspaceId: 'w1', name: 'Member' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(roles.update).not.toHaveBeenCalled();
  });

  it('translates UnknownPermissionsError into BadRequestException', async () => {
    roles.findByIdInWorkspace.mockResolvedValue(baseRole());
    roles.update.mockRejectedValue(new UnknownPermissionsError(['user:beam']));

    await expect(
      useCase.execute({
        id: 'r1',
        workspaceId: 'w1',
        permissionKeys: ['user:beam'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
