import { NotFoundException } from '@nestjs/common';
import { GetUserByIdUseCase } from './get-user-by-id.use-case';
import { UsersRepository } from '../repositories/users.repository.interface';
import type { User } from '@modules/users/entities/user.entity';

describe('GetUserByIdUseCase', () => {
  let users: jest.Mocked<UsersRepository>;
  let useCase: GetUserByIdUseCase;

  beforeEach(() => {
    users = {
      findByIdInWorkspace: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
    useCase = new GetUserByIdUseCase(users);
  });

  it('returns mapped user when found', async () => {
    users.findByIdInWorkspace.mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      name: 'Jane',
      twoFactorEnabled: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
    } as User);

    const result = await useCase.execute({ id: 'u1', workspaceId: 'w1' });

    expect(users.findByIdInWorkspace).toHaveBeenCalledWith('u1', 'w1');
    expect(result).toEqual({
      id: 'u1',
      email: 'a@b.c',
      name: 'Jane',
      twoFactorEnabled: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
    });
  });

  it('throws NotFoundException when user is not in the workspace', async () => {
    users.findByIdInWorkspace.mockResolvedValue(null);
    await expect(useCase.execute({ id: 'u1', workspaceId: 'w1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
