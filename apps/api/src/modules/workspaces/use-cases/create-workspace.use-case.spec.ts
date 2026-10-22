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

  it('creates the workspace with slug + nanoid suffix and the five Hostly roles', async () => {
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

    const result = await useCase.execute({
      userId: 'u1',
      name: 'Acme Inc.',
      internalClientName: 'Acme own robots',
    });

    const arg = workspaces.createWithDefaults.mock.calls[0]![0];
    expect(arg.name).toBe('Acme Inc.');
    expect(arg.slug).toMatch(/^acme-inc-/);
    expect(arg.ownerId).toBe('u1');
    expect(arg.isPersonal).toBe(false);
    expect(arg.ownerRoleName).toBe('operator_admin');
    expect(arg.internalClientName).toBe('Acme own robots');
    expect(arg.defaultRoles.map((r) => r.name)).toEqual([
      'operator_admin',
      'operator_staff',
      'client_admin',
      'client_editor',
      'advertiser',
    ]);

    const byName = new Map(arg.defaultRoles.map((r) => [r.name, r.permissionKeys]));
    expect(byName.get('operator_admin')).not.toContain('workspace:delete');
    expect(byName.get('operator_admin')).toContain('role:assign');
    for (const role of ['operator_staff', 'client_admin', 'client_editor', 'advertiser']) {
      expect(byName.get(role)!.every((k) => k.endsWith(':read'))).toBe(true);
      expect(byName.get(role)).not.toContain('workspace:invite');
    }
    expect(byName.get('client_editor')).not.toContain('audit:read');
    for (const role of ['operator_staff', 'client_admin', 'client_editor']) {
      expect(byName.get(role)).toEqual(expect.arrayContaining(['client:read', 'site:read']));
    }
    expect(byName.get('operator_admin')).toEqual(
      expect.arrayContaining(['client:create', 'client:delete', 'site:create', 'site:delete']),
    );
    expect(byName.get('advertiser')).toEqual(['workspace:read']);

    expect(result.id).toBe('w1');
  });

  it('honors isPersonal=true', async () => {
    workspaces.createWithDefaults.mockResolvedValue({
      workspace: { id: 'w1', isPersonal: true } as never,
      roles: [],
    } as never);
    await useCase.execute({
      userId: 'u1',
      name: 'Personal',
      internalClientName: 'Own robots',
      isPersonal: true,
    });
    expect(workspaces.createWithDefaults.mock.calls[0]![0].isPersonal).toBe(true);
  });
});
