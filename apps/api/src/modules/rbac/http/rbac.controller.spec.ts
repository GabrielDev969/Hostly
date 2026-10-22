import { RbacController } from './rbac.controller';
import { CreateRoleUseCase } from '../use-cases/create-role.use-case';
import { ListRolesUseCase } from '../use-cases/list-roles.use-case';
import { UpdateRoleUseCase } from '../use-cases/update-role.use-case';
import { DeleteRoleUseCase } from '../use-cases/delete-role.use-case';
import { AssignPermissionToRoleUseCase } from '../use-cases/assign-permission-to-role.use-case';
import { CreateRoleDto } from './dto/create-role.dto';
import { AssignPermissionDto } from './dto/assign-permission.dto';
import { RoleResponseDto } from './dto/role-response.dto';
import type { WorkspaceContext } from '@shared/types/workspace-context.type';

describe('RbacController', () => {
  const workspace = { id: 'w1' } as WorkspaceContext;

  const roleDto: RoleResponseDto = {
    id: 'r1',
    name: 'Editor',
    description: 'Can edit content',
    isSystem: false,
    permissions: [{ key: 'user:read', description: null, category: 'user' }],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  let createRole: jest.Mocked<CreateRoleUseCase>;
  let listRoles: jest.Mocked<ListRolesUseCase>;
  let updateRole: jest.Mocked<UpdateRoleUseCase>;
  let deleteRole: jest.Mocked<DeleteRoleUseCase>;
  let assignPermission: jest.Mocked<AssignPermissionToRoleUseCase>;
  let controller: RbacController;

  beforeEach(() => {
    createRole = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateRoleUseCase>;
    listRoles = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListRolesUseCase>;
    updateRole = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateRoleUseCase>;
    deleteRole = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<DeleteRoleUseCase>;
    assignPermission = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<AssignPermissionToRoleUseCase>;
    controller = new RbacController(
      createRole,
      listRoles,
      updateRole,
      deleteRole,
      assignPermission,
    );
  });

  it('create forwards workspace id and DTO fields to CreateRoleUseCase', async () => {
    const dto: CreateRoleDto = {
      name: 'Editor',
      description: 'Can edit content',
      permissionKeys: ['user:read', 'workspace:read'],
    };
    createRole.execute.mockResolvedValue(roleDto);

    const result = await controller.create(dto, workspace);

    expect(createRole.execute).toHaveBeenCalledWith({
      workspaceId: 'w1',
      name: 'Editor',
      description: 'Can edit content',
      permissionKeys: ['user:read', 'workspace:read'],
    });
    expect(result).toBe(roleDto);
  });

  it('list forwards workspace id', async () => {
    listRoles.execute.mockResolvedValue([roleDto]);
    const result = await controller.list(workspace);
    expect(listRoles.execute).toHaveBeenCalledWith('w1');
    expect(result).toEqual([roleDto]);
  });

  it('update forwards id, workspace and dto', async () => {
    updateRole.execute.mockResolvedValue(roleDto);
    await controller.update('r1', { name: 'Renamed', permissionKeys: ['user:read'] }, workspace);
    expect(updateRole.execute).toHaveBeenCalledWith({
      id: 'r1',
      workspaceId: 'w1',
      name: 'Renamed',
      permissionKeys: ['user:read'],
    });
  });

  it('remove forwards id and workspace', async () => {
    deleteRole.execute.mockResolvedValue(undefined);
    await controller.remove('r1', workspace);
    expect(deleteRole.execute).toHaveBeenCalledWith({
      id: 'r1',
      workspaceId: 'w1',
    });
  });

  it('addPermission delegates to AssignPermissionToRoleUseCase with role and workspace', async () => {
    const dto: AssignPermissionDto = { permissionKey: 'user:create' };
    assignPermission.execute.mockResolvedValue(roleDto);

    await controller.addPermission('r1', dto, workspace);

    expect(assignPermission.execute).toHaveBeenCalledWith({
      roleId: 'r1',
      workspaceId: 'w1',
      permissionKey: 'user:create',
    });
  });
});
