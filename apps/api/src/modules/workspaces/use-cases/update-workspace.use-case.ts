import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { WorkspacesRepository } from '../repositories/workspaces.repository.interface';
import { WorkspaceResponseDto, toWorkspaceDto } from '../http/dto/workspace-response.dto';
import { ADMIN_WORKSPACE_SLUG } from '@modules/rbac/constants/system';

interface UpdateWorkspaceInput {
  id: string;
  name?: string;
}

@Injectable()
export class UpdateWorkspaceUseCase {
  constructor(private workspaces: WorkspacesRepository) {}

  async execute(input: UpdateWorkspaceInput): Promise<WorkspaceResponseDto> {
    const workspace = await this.workspaces.findById(input.id);
    if (!workspace) throw new NotFoundException('Workspace not found');
    if (workspace.slug === ADMIN_WORKSPACE_SLUG)
      throw new ForbiddenException('The admin workspace cannot be modified');

    const updated = await this.workspaces.update(input.id, {
      name: input.name,
    });
    return toWorkspaceDto(updated);
  }
}
