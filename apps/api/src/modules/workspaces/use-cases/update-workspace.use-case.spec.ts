import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UpdateWorkspaceUseCase } from './update-workspace.use-case';
import { WorkspacesRepository } from '../repositories/workspaces.repository.interface';
import { Workspace } from '../entities/workspace.entity';
import { ADMIN_WORKSPACE_SLUG } from '@modules/rbac/constants/system';

describe('UpdateWorkspaceUseCase', () => {
  let workspaces: jest.Mocked<WorkspacesRepository>;
  let useCase: UpdateWorkspaceUseCase;

  const baseWorkspace = (overrides: Partial<Workspace> = {}): Workspace => ({
    id: 'w1',
    name: 'Acme',
    slug: 'acme',
    isPersonal: false,
    ownerId: 'u1',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    organizationId: 'org1',
    ...overrides,
  });

  beforeEach(() => {
    workspaces = {
      createWithDefaults: jest.fn(),
      findById: jest.fn(),
      findBySlug: jest.fn(),
      findByUserId: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      transferOwnership: jest.fn(),
    };
    useCase = new UpdateWorkspaceUseCase(workspaces);
  });

  it('updates the workspace name', async () => {
    workspaces.findById.mockResolvedValue(baseWorkspace());
    workspaces.update.mockResolvedValue(baseWorkspace({ name: 'Acme Inc.' }));

    const result = await useCase.execute({ id: 'w1', name: 'Acme Inc.' });

    expect(workspaces.update).toHaveBeenCalledWith('w1', { name: 'Acme Inc.' });
    expect(result.name).toBe('Acme Inc.');
  });

  it('throws 404 when workspace does not exist', async () => {
    workspaces.findById.mockResolvedValue(null);

    await expect(useCase.execute({ id: 'missing', name: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('forbids modifying the admin workspace', async () => {
    workspaces.findById.mockResolvedValue(baseWorkspace({ slug: ADMIN_WORKSPACE_SLUG }));

    await expect(useCase.execute({ id: 'w1', name: 'Hacked' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(workspaces.update).not.toHaveBeenCalled();
  });
});
