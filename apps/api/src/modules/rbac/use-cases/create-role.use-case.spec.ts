import { BadRequestException, ConflictException } from '@nestjs/common';
import { CreateRoleUseCase } from './create-role.use-case';
import { RolesRepository } from '../repositories/roles.repository.interface';
import { UnknownPermissionsError } from '../errors/unknown-permissions.error';

describe('CreateRoleUseCase', () => {
  let roles: jest.Mocked<RolesRepository>;
  let useCase: CreateRoleUseCase;

  beforeEach(() => {
    roles = {
      findByNameInWorkspace: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<RolesRepository>;
    useCase = new CreateRoleUseCase(roles);
  });

  it('throws ConflictException when role name is already taken in the workspace', async () => {
    roles.findByNameInWorkspace.mockResolvedValue({ id: 'existing' } as never);
    await expect(
      useCase.execute({
        workspaceId: 'w1',
        name: 'Admin',
        permissionKeys: [],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(roles.create).not.toHaveBeenCalled();
  });

  it('creates a non-system role and returns the dto', async () => {
    roles.findByNameInWorkspace.mockResolvedValue(null);
    roles.create.mockResolvedValue({
      id: 'r1',
      name: 'Reviewer',
      description: 'Read + comment',
      isSystem: false,
      workspaceId: 'w1',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      permissions: [],
    });

    const result = await useCase.execute({
      workspaceId: 'w1',
      name: 'Reviewer',
      description: 'Read + comment',
      permissionKeys: ['user:read'],
    });

    expect(roles.create).toHaveBeenCalledWith({
      workspaceId: 'w1',
      name: 'Reviewer',
      description: 'Read + comment',
      permissionKeys: ['user:read'],
      isSystem: false,
    });
    expect(result.id).toBe('r1');
  });

  it('translates UnknownPermissionsError from the repository into BadRequestException', async () => {
    roles.findByNameInWorkspace.mockResolvedValue(null);
    roles.create.mockRejectedValue(new UnknownPermissionsError(['user:nuke']));

    await expect(
      useCase.execute({
        workspaceId: 'w1',
        name: 'Bad',
        permissionKeys: ['user:nuke'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
