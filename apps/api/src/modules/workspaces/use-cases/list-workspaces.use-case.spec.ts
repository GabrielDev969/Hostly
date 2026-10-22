import { ListWorkspacesUseCase } from './list-workspaces.use-case';
import { WorkspacesRepository } from '../repositories/workspaces.repository.interface';
import { Workspace } from '../entities/workspace.entity';
import { ADMIN_WORKSPACE_SLUG } from '@modules/rbac/constants/system';

describe('ListWorkspacesUseCase', () => {
  let workspaces: jest.Mocked<WorkspacesRepository>;
  let useCase: ListWorkspacesUseCase;

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
    useCase = new ListWorkspacesUseCase(workspaces);
  });

  const ws = (slug: string, name = slug): Workspace => ({
    id: slug,
    name,
    slug,
    isPersonal: false,
    ownerId: 'u1',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    organizationId: 'org1',
  });

  it('returns workspaces the user belongs to, hiding the admin workspace', async () => {
    workspaces.findByUserId.mockResolvedValue([
      ws('personal'),
      ws(ADMIN_WORKSPACE_SLUG),
      ws('acme'),
    ]);

    const result = await useCase.execute('u1');

    expect(result).toHaveLength(2);
    expect(result.map((w) => w.slug)).toEqual(['personal', 'acme']);
  });

  it('returns an empty array when the user has no workspaces', async () => {
    workspaces.findByUserId.mockResolvedValue([]);

    expect(await useCase.execute('u1')).toEqual([]);
  });
});
