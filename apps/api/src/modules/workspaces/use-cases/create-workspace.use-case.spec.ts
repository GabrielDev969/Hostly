import { CreateWorkspaceUseCase } from './create-workspace.use-case';
import { WorkspacesRepository } from '../repositories/workspaces.repository.interface';

describe('CreateWorkspaceUseCase', () => {
  let workspaces: jest.Mocked<WorkspacesRepository>;
  let useCase: CreateWorkspaceUseCase;

  beforeEach(() => {
    workspaces = {
      createWithDefaults: jest.fn(),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    useCase = new CreateWorkspaceUseCase(workspaces);
  });

  it('creates the workspace with slug + nanoid suffix and three default roles', async () => {
    workspaces.createWithDefaults.mockResolvedValue({
      workspace: {
        id: 'w1',
        name: 'Acme Inc.',
        slug: 'acme-inc-test',
        ownerId: 'u1',
        isPersonal: false,
      },
      roles: [],
    } as never);

    const result = await useCase.execute({ userId: 'u1', name: 'Acme Inc.' });

    const arg = workspaces.createWithDefaults.mock.calls[0]![0];
    expect(arg.name).toBe('Acme Inc.');
    expect(arg.slug).toMatch(/^acme-inc-/);
    expect(arg.ownerId).toBe('u1');
    expect(arg.isPersonal).toBe(false);
    expect(arg.ownerRoleName).toBe('Owner');
    expect(arg.defaultRoles).toHaveLength(3);

    const [owner, admin, member] = arg.defaultRoles;
    expect(owner!.name).toBe('Owner');
    expect(owner!.permissionKeys.length).toBeGreaterThan(0);
    expect(admin!.permissionKeys.every((k) => !k.includes(':delete'))).toBe(true);
    expect(
      member!.permissionKeys.every((k) => k.endsWith(':read') || k === 'workspace:invite'),
    ).toBe(true);

    expect(result.id).toBe('w1');
  });

  it('honors isPersonal=true', async () => {
    workspaces.createWithDefaults.mockResolvedValue({
      workspace: { id: 'w1', isPersonal: true } as never,
      roles: [],
    } as never);
    await useCase.execute({ userId: 'u1', name: 'Personal', isPersonal: true });
    expect(workspaces.createWithDefaults.mock.calls[0]![0].isPersonal).toBe(true);
  });
});
