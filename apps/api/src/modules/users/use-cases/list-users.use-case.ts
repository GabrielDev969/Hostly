import { Injectable } from '@nestjs/common';
import { UsersRepository } from '../repositories/users.repository.interface';
import { UserResponseDto } from '../http/dto/user-response.dto';
import { PaginatedResponseDto } from '@shared/dto/paginated-response.dto';

interface ListUsersInput {
  workspaceId: string;
  page: number;
  limit: number;
  search?: string;
}

@Injectable()
export class ListUsersUseCase {
  constructor(private readonly users: UsersRepository) {}

  async execute(input: ListUsersInput): Promise<PaginatedResponseDto<UserResponseDto>> {
    const { items, total } = await this.users.findManyByWorkspace({
      workspaceId: input.workspaceId,
      page: input.page,
      limit: input.limit,
      search: input.search,
    });

    return {
      data: items.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        twoFactorEnabled: user.twoFactorEnabled,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })),
      meta: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.ceil(total / input.limit),
      },
    };
  }
}
