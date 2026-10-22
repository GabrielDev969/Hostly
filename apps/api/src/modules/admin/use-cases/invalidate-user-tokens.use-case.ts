import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { SessionsRepository } from '@modules/sessions/repositories/sessions.repository.interface';

interface InvalidateUserTokensInput {
  userId: string;
}

@Injectable()
export class InvalidateUserTokensUseCase {
  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
  ) {}

  async execute(input: InvalidateUserTokensInput): Promise<void> {
    const user = await this.users.findById(input.userId);
    if (!user) throw new NotFoundException('User not found');

    await this.users.invalidateTokens(input.userId);
    await this.sessions.revokeAllForUser(input.userId);
  }
}
