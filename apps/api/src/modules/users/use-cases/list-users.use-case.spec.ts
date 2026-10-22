import { ListUsersUseCase } from './list-users.use-case';
import { UsersRepository } from '../repositories/users.repository.interface';
import type { User } from '@modules/users/entities/user.entity';

describe('ListUsersUseCase', () => {
  let users: jest.Mocked<UsersRepository>;
  let useCase: ListUsersUseCase;

  beforeEach(() => {
    users = {
      findManyByWorkspace: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
    useCase = new ListUsersUseCase(users);
  });

  it('returns paginated mapped users with totalPages computed', async () => {
    users.findManyByWorkspace.mockResolvedValue({
      items: [
        {
          id: 'u1',
          email: 'a@b.c',
          name: 'A',
          twoFactorEnabled: false,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-02'),
        } as User,
      ],
      total: 11,
    });

    const result = await useCase.execute({
      workspaceId: 'w1',
      page: 2,
      limit: 5,
      search: 'jane',
    });

    expect(users.findManyByWorkspace).toHaveBeenCalledWith({
      workspaceId: 'w1',
      page: 2,
      limit: 5,
      search: 'jane',
    });
    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({
      page: 2,
      limit: 5,
      total: 11,
      totalPages: 3,
    });
  });

  it('returns empty data with totalPages=0 when no records', async () => {
    users.findManyByWorkspace.mockResolvedValue({ items: [], total: 0 });
    const result = await useCase.execute({
      workspaceId: 'w1',
      page: 1,
      limit: 10,
    });
    expect(result.data).toEqual([]);
    expect(result.meta.totalPages).toBe(0);
  });
});
