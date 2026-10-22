import { NotFoundException } from '@nestjs/common';
import { InvalidateUserTokensUseCase } from './invalidate-user-tokens.use-case';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { SessionsRepository } from '@modules/sessions/repositories/sessions.repository.interface';
import { User } from '@modules/users/entities/user.entity';

describe('InvalidateUserTokensUseCase', () => {
  let users: jest.Mocked<UsersRepository>;
  let sessions: jest.Mocked<SessionsRepository>;
  let useCase: InvalidateUserTokensUseCase;

  beforeEach(() => {
    users = {
      findById: jest.fn(),
      invalidateTokens: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
    sessions = {
      revokeAllForUser: jest.fn(),
    } as unknown as jest.Mocked<SessionsRepository>;
    useCase = new InvalidateUserTokensUseCase(users, sessions);
  });

  it('throws NotFound when user is missing', async () => {
    users.findById.mockResolvedValue(null);
    await expect(useCase.execute({ userId: 'u-missing' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(users.invalidateTokens).not.toHaveBeenCalled();
    expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('bumps tokensInvalidatedAt and revokes all sessions for the user', async () => {
    users.findById.mockResolvedValue({ id: 'u1' } as User);
    await useCase.execute({ userId: 'u1' });
    expect(users.invalidateTokens).toHaveBeenCalledWith('u1');
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith('u1');
  });
});
