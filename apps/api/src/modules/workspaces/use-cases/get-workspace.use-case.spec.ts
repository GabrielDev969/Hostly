import { NotFoundException } from '@nestjs/common';
import { GetWorkspaceUseCase } from './get-workspace.use-case';
import { WorkspacesRepository } from '../repositories/workspaces.repository.interface';
import type { Workspace } from '@modules/workspaces/entities/workspace.entity';

describe('GetWorkspaceUseCase', () => {
  let workspaces: jest.Mocked<WorkspacesRepository>;
  let useCase: GetWorkspaceUseCase;

  beforeEach(() => {
    workspaces = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    useCase = new GetWorkspaceUseCase(workspaces);
  });

  it('throws NotFoundException when workspace is missing', async () => {
    workspaces.findById.mockResolvedValue(null);
    await expect(useCase.execute('w-missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the mapped workspace dto when found', async () => {
    workspaces.findById.mockResolvedValue({
      id: 'w1',
      name: 'Acme',
      slug: 'acme',
      ownerId: 'u1',
      isPersonal: false,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
    } as Workspace);

    const result = await useCase.execute('w1');
    expect(result.id).toBe('w1');
    expect(result.name).toBe('Acme');
    expect(result.slug).toBe('acme');
  });
});
