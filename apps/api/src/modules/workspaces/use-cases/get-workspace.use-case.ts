import { Injectable, NotFoundException } from '@nestjs/common';
import { WorkspacesRepository } from '../repositories/workspaces.repository.interface';
import { WorkspaceResponseDto, toWorkspaceDto } from '../http/dto/workspace-response.dto';

@Injectable()
export class GetWorkspaceUseCase {
  constructor(private workspaces: WorkspacesRepository) {}

  async execute(id: string): Promise<WorkspaceResponseDto> {
    const workspace = await this.workspaces.findById(id);
    if (!workspace) throw new NotFoundException('Workspace not found');
    return toWorkspaceDto(workspace);
  }
}
