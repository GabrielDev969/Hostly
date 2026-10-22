import { ListRolesUseCase } from './list-roles.use-case';
import { RolesRepository } from '../repositories/roles.repository.interface';

describe('ListRolesUseCase', () => {
  let roles: jest.Mocked<RolesRepository>;
  let useCase: ListRolesUseCase;

  beforeEach(() => {
    roles = {
      findManyByWorkspace: jest.fn(),
    } as unknown as jest.Mocked<RolesRepository>;
    useCase = new ListRolesUseCase(roles);
  });

  it('returns mapped roles for a workspace', async () => {
    roles.findManyByWorkspace.mockResolvedValue([
      {
        id: 'r1',
        name: 'Owner',
        description: null,
        isSystem: true,
        workspaceId: 'w1',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        permissions: [],
      },
      {
        id: 'r2',
        name: 'Member',
        description: null,
        isSystem: true,
        workspaceId: 'w1',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        permissions: [],
      },
    ] as never);

    const result = await useCase.execute('w1');
    expect(roles.findManyByWorkspace).toHaveBeenCalledWith('w1');
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe('Owner');
  });

  it('returns an empty array when the workspace has no roles', async () => {
    roles.findManyByWorkspace.mockResolvedValue([]);
    expect(await useCase.execute('w1')).toEqual([]);
  });
});
