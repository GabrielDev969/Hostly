import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AssignPermissionToRoleUseCase } from './assign-permission-to-role.use-case';
import { RolesRepository } from '../repositories/roles.repository.interface';
import { PermissionsRepository } from '../repositories/permissions.repository.interface';
import { UnknownPermissionsError } from '../errors/unknown-permissions.error';
import { Permission } from '../entities/permission.entity';

describe('AssignPermissionToRoleUseCase', () => {
  let roles: jest.Mocked<RolesRepository>;
  let permissions: jest.Mocked<PermissionsRepository>;
  let useCase: AssignPermissionToRoleUseCase;

  const userRead: Permission = {
    id: 'p1',
    key: 'user:read',
    description: null,
    category: 'user',
    workspaceId: null,
  };

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
    permissions = {
      findAll: jest.fn(),
      findByKey: jest.fn(),
      findManyByKeys: jest.fn(),
      findByCategory: jest.fn(),
      findByKeyInScope: jest.fn(),
      findManyByKeysInScope: jest.fn(),
      findAllForWorkspace: jest.fn(),
      findByIdInWorkspace: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new AssignPermissionToRoleUseCase(roles, permissions);
  });

  const baseRole = (perms: Permission[] = [], isSystem = false) => ({
    id: 'r1',
    name: 'Editor',
    description: null,
    workspaceId: 'w1',
    isSystem,
    permissions: perms,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it('adds the permission when the role does not have it yet', async () => {
    roles.findByIdInWorkspace.mockResolvedValue(baseRole());
    permissions.findByKeyInScope.mockResolvedValue(userRead);
    roles.update.mockResolvedValue(baseRole([userRead]));

    await useCase.execute({
      roleId: 'r1',
      workspaceId: 'w1',
      permissionKey: 'user:read',
    });

    expect(roles.update).toHaveBeenCalledWith('r1', {
      permissionKeys: ['user:read'],
    });
  });

  it('preserves existing permissions when adding a new one', async () => {
    const userCreate: Permission = {
      id: 'p2',
      key: 'user:create',
      description: null,
      category: 'user',
      workspaceId: null,
    };
    roles.findByIdInWorkspace.mockResolvedValue(baseRole([userRead]));
    permissions.findByKeyInScope.mockResolvedValue(userCreate);
    roles.update.mockResolvedValue(baseRole([userRead, userCreate]));

    await useCase.execute({
      roleId: 'r1',
      workspaceId: 'w1',
      permissionKey: 'user:create',
    });

    expect(roles.update).toHaveBeenCalledWith('r1', {
      permissionKeys: ['user:read', 'user:create'],
    });
  });

  it('is idempotent — returns the role unchanged when permission is already assigned', async () => {
    roles.findByIdInWorkspace.mockResolvedValue(baseRole([userRead]));
    permissions.findByKeyInScope.mockResolvedValue(userRead);

    await useCase.execute({
      roleId: 'r1',
      workspaceId: 'w1',
      permissionKey: 'user:read',
    });

    expect(roles.update).not.toHaveBeenCalled();
  });

  it('throws 404 when the permission key does not exist', async () => {
    roles.findByIdInWorkspace.mockResolvedValue(baseRole());
    permissions.findByKeyInScope.mockResolvedValue(null);

    await expect(
      useCase.execute({
        roleId: 'r1',
        workspaceId: 'w1',
        permissionKey: 'invalid:key',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('forbids modifying system roles', async () => {
    roles.findByIdInWorkspace.mockResolvedValue(baseRole([], true));

    await expect(
      useCase.execute({
        roleId: 'r1',
        workspaceId: 'w1',
        permissionKey: 'user:read',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(permissions.findByKeyInScope).not.toHaveBeenCalled();
  });

  it('translates UnknownPermissionsError into BadRequestException when the role had a stale permission key', async () => {
    roles.findByIdInWorkspace.mockResolvedValue(baseRole([userRead]));
    permissions.findByKeyInScope.mockResolvedValue({
      id: 'p2',
      key: 'user:create',
      description: null,
      category: 'user',
      workspaceId: null,
    });
    roles.update.mockRejectedValue(new UnknownPermissionsError(['user:read']));

    await expect(
      useCase.execute({
        roleId: 'r1',
        workspaceId: 'w1',
        permissionKey: 'user:create',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
