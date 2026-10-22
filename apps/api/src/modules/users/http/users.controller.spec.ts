import { UsersController } from './users.controller';
import { ListUsersUseCase } from '../use-cases/list-users.use-case';
import { GetUserByIdUseCase } from '../use-cases/get-user-by-id.use-case';
import { CreateUserUseCase } from '../use-cases/create-user.use-case';
import { UpdateUserUseCase } from '../use-cases/update-user.use-case';
import { DeleteUserUseCase } from '../use-cases/delete-user.use-case';
import { UserResponseDto } from './dto/user-response.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import type { WorkspaceContext } from '@shared/types/workspace-context.type';
import type { AuthenticatedUser } from '@shared/types/authenticated-user.type';

describe('UsersController', () => {
  const workspace = { id: 'w1' } as WorkspaceContext;
  const currentUser: AuthenticatedUser = { id: 'admin1' };

  const userDto: UserResponseDto = {
    id: 'u1',
    email: 'jane@example.com',
    name: 'Jane',
    twoFactorEnabled: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  let listUsers: jest.Mocked<ListUsersUseCase>;
  let getUserById: jest.Mocked<GetUserByIdUseCase>;
  let createUser: jest.Mocked<CreateUserUseCase>;
  let updateUser: jest.Mocked<UpdateUserUseCase>;
  let deleteUser: jest.Mocked<DeleteUserUseCase>;
  let controller: UsersController;

  beforeEach(() => {
    listUsers = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListUsersUseCase>;
    getUserById = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetUserByIdUseCase>;
    createUser = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateUserUseCase>;
    updateUser = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateUserUseCase>;
    deleteUser = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<DeleteUserUseCase>;
    controller = new UsersController(listUsers, getUserById, createUser, updateUser, deleteUser);
  });

  it('list forwards workspace id and pagination query to ListUsersUseCase', async () => {
    const query: ListUsersQueryDto = { page: 2, limit: 50, search: 'jane' };
    const paginated = {
      data: [userDto],
      meta: { page: 2, limit: 50, total: 1, totalPages: 1 },
    };
    listUsers.execute.mockResolvedValue(paginated);

    const result = await controller.list(workspace, query);

    expect(listUsers.execute).toHaveBeenCalledWith({
      workspaceId: 'w1',
      page: 2,
      limit: 50,
      search: 'jane',
    });
    expect(result).toBe(paginated);
  });

  it('findOne forwards id and workspace id to GetUserByIdUseCase', async () => {
    getUserById.execute.mockResolvedValue(userDto);
    const result = await controller.findOne('u1', workspace);
    expect(getUserById.execute).toHaveBeenCalledWith({
      id: 'u1',
      workspaceId: 'w1',
    });
    expect(result).toBe(userDto);
  });

  it('create merges workspace id and creator into CreateUserUseCase input', async () => {
    const dto: CreateUserDto = {
      email: 'jane@example.com',
      name: 'Jane',
      password: 'StrongPass@1234',
      roleId: '00000000-0000-0000-0000-000000000001',
    };
    createUser.execute.mockResolvedValue(userDto);

    const result = await controller.create(dto, workspace, currentUser);

    expect(createUser.execute).toHaveBeenCalledWith({
      ...dto,
      workspaceId: 'w1',
      createdBy: 'admin1',
    });
    expect(result).toBe(userDto);
  });

  it('update forwards id, workspace and DTO to UpdateUserUseCase', async () => {
    const dto: UpdateUserDto = { name: 'Jane Doe' };
    updateUser.execute.mockResolvedValue(userDto);

    await controller.update('u1', dto, workspace);

    expect(updateUser.execute).toHaveBeenCalledWith({
      id: 'u1',
      workspaceId: 'w1',
      name: 'Jane Doe',
    });
  });

  it('remove delegates to DeleteUserUseCase with id and workspace', async () => {
    deleteUser.execute.mockResolvedValue(undefined);

    await controller.remove('u1', workspace);

    expect(deleteUser.execute).toHaveBeenCalledWith({
      id: 'u1',
      workspaceId: 'w1',
    });
  });
});
