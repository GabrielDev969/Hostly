import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { WorkspacesRepository } from '../repositories/workspaces.repository.interface';
import { ADMIN_WORKSPACE_SLUG } from '@modules/rbac/constants/system';

@Injectable()
export class DeleteWorkspaceUseCase {
  constructor(private workspaces: WorkspacesRepository) {}

  async execute(id: string): Promise<void> {
    const workspace = await this.workspaces.findById(id);
    if (!workspace) throw new NotFoundException('Workspace not found');
    if (workspace.slug === ADMIN_WORKSPACE_SLUG)
      throw new ForbiddenException('The admin workspace cannot be deleted');
    if (workspace.isPersonal) throw new ForbiddenException('Personal workspaces cannot be deleted');

    await this.workspaces.softDelete(id);
  }
}
