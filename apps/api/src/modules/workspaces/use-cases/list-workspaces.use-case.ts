import { Injectable } from '@nestjs/common';
import { WorkspacesRepository } from '../repositories/workspaces.repository.interface';
import { WorkspaceResponseDto, toWorkspaceDto } from '../http/dto/workspace-response.dto';
import { ADMIN_WORKSPACE_SLUG } from '@modules/rbac/constants/system';

@Injectable()
export class ListWorkspacesUseCase {
  constructor(private workspaces: WorkspacesRepository) {}

  async execute(userId: string): Promise<WorkspaceResponseDto[]> {
    const workspaces = await this.workspaces.findByUserId(userId);
    return workspaces.filter((w) => w.slug !== ADMIN_WORKSPACE_SLUG).map(toWorkspaceDto);
  }
}
