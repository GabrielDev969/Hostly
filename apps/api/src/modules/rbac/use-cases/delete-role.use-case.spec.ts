import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DeleteRoleUseCase } from './delete-role.use-case';
import { RolesRepository } from '../repositories/roles.repository.interface';
import { Permission } from '../entities/permission.entity';

describe('DeleteRoleUseCase', () => {
  let roles: jest.Mocked<RolesRepository>;
  let useCase: DeleteRoleUseCase;

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
    useCase = new DeleteRoleUseCase(roles);
  });

  const baseRole = (overrides: Partial<{ isSystem: boolean }> = {}) => ({
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

  it('deletes a role with no members', async () => {
    roles.findByIdInWorkspace.mockResolvedValue(baseRole());
    roles.countMembersUsingRole.mockResolvedValue(0);

    await useCase.execute({ id: 'r1', workspaceId: 'w1' });

    expect(roles.delete).toHaveBeenCalledWith('r1');
  });

  it('throws 404 when role is not in the workspace', async () => {
    roles.findByIdInWorkspace.mockResolvedValue(null);

    await expect(useCase.execute({ id: 'r1', workspaceId: 'w1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('forbids deleting system roles', async () => {
    roles.findByIdInWorkspace.mockResolvedValue(baseRole({ isSystem: true }));

    await expect(useCase.execute({ id: 'r1', workspaceId: 'w1' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(roles.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete a role in use by members', async () => {
    roles.findByIdInWorkspace.mockResolvedValue(baseRole());
    roles.countMembersUsingRole.mockResolvedValue(3);

    await expect(useCase.execute({ id: 'r1', workspaceId: 'w1' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(roles.delete).not.toHaveBeenCalled();
  });
});
