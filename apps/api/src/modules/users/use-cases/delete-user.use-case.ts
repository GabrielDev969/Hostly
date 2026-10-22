import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { UsersRepository } from '../repositories/users.repository.interface';
import { WorkspacesRepository } from '@modules/workspaces/repositories/workspaces.repository.interface';

interface DeleteUserInput {
  id: string;
  workspaceId: string;
}

@Injectable()
export class DeleteUserUseCase {
  constructor(
    private readonly users: UsersRepository,
    private readonly workspaces: WorkspacesRepository,
  ) {}

  async execute(input: DeleteUserInput): Promise<void> {
    const user = await this.users.findByIdInWorkspace(input.id, input.workspaceId);
    if (!user) throw new NotFoundException('User not found');

    // Cannot delete the workspace owner
    const workspace = await this.workspaces.findById(input.workspaceId);
    if (workspace?.ownerId === input.id) {
      throw new ForbiddenException('Cannot delete the workspace owner');
    }

    await this.users.softDelete(input.id);
  }
}
