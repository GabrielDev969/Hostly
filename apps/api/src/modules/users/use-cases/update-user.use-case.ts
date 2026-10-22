import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { UsersRepository } from '../repositories/users.repository.interface';
import { UserResponseDto } from '../http/dto/user-response.dto';

interface UpdateUserInput {
  id: string;
  workspaceId: string;
  email?: string;
  name?: string;
}

@Injectable()
export class UpdateUserUseCase {
  constructor(private readonly users: UsersRepository) {}

  async execute(input: UpdateUserInput): Promise<UserResponseDto> {
    const user = await this.users.findByIdInWorkspace(input.id, input.workspaceId);
    if (!user) throw new NotFoundException('User not found');

    // If email is changing, ensure no conflict
    if (input.email && input.email !== user.email) {
      const existing = await this.users.findByEmail(input.email);
      if (existing && existing.id !== user.id) {
        throw new ConflictException('Email already in use');
      }
    }

    const updated = await this.users.update(input.id, {
      email: input.email,
      name: input.name,
    });

    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      twoFactorEnabled: updated.twoFactorEnabled,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }
}
