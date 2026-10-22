import { ListMembersUseCase } from './list-members.use-case';
import {
  WorkspaceMembersRepository,
  WorkspaceMemberListItem,
} from '../repositories/workspace-members.repository.interface';

describe('ListMembersUseCase', () => {
  it('delegates to the members repository', async () => {
    const members = {
      findManyByWorkspaceWithRelations: jest
        .fn()
        .mockResolvedValue([{ id: 'm1' } as WorkspaceMemberListItem]),
    } as unknown as jest.Mocked<WorkspaceMembersRepository>;

    const useCase = new ListMembersUseCase(members);
    const result = await useCase.execute('w1');

    expect(members.findManyByWorkspaceWithRelations).toHaveBeenCalledWith('w1');
    expect(result).toHaveLength(1);
  });
});
