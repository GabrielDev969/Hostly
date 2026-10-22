import { Injectable } from '@nestjs/common';
import {
  WorkspaceMembersRepository,
  WorkspaceMemberListItem,
} from '../repositories/workspace-members.repository.interface';

@Injectable()
export class ListMembersUseCase {
  constructor(private readonly members: WorkspaceMembersRepository) {}

  async execute(workspaceId: string): Promise<WorkspaceMemberListItem[]> {
    return this.members.findManyByWorkspaceWithRelations(workspaceId);
  }
}
