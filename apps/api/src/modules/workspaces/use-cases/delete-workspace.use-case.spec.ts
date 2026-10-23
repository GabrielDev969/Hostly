import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DeleteWorkspaceUseCase } from './delete-workspace.use-case';
import { WorkspacesRepository } from '../repositories/workspaces.repository.interface';
import { Workspace } from '../entities/workspace.entity';
import { ADMIN_WORKSPACE_SLUG } from '@modules/rbac/constants/system';

describe('DeleteWorkspaceUseCase', () => {
  let workspaces: jest.Mocked<WorkspacesRepository>;
  let useCase: DeleteWorkspaceUseCase;

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
      findOperatorWorkspaceId: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      transferOwnership: jest.fn(),
    };
    useCase = new DeleteWorkspaceUseCase(workspaces);
  });

  it('soft-deletes a regular workspace', async () => {
    workspaces.findById.mockResolvedValue(baseWorkspace());

    await useCase.execute('w1');

    expect(workspaces.softDelete).toHaveBeenCalledWith('w1');
  });

  it('throws 404 when workspace does not exist', async () => {
    workspaces.findById.mockResolvedValue(null);

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(workspaces.softDelete).not.toHaveBeenCalled();
  });

  it('blocks deletion of the admin workspace', async () => {
    workspaces.findById.mockResolvedValue(baseWorkspace({ slug: ADMIN_WORKSPACE_SLUG }));

    await expect(useCase.execute('w1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(workspaces.softDelete).not.toHaveBeenCalled();
  });

  it('blocks deletion of personal workspaces', async () => {
    workspaces.findById.mockResolvedValue(baseWorkspace({ isPersonal: true }));

    await expect(useCase.execute('w1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(workspaces.softDelete).not.toHaveBeenCalled();
  });
});
