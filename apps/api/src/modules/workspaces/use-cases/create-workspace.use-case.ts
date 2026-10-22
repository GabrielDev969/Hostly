import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { WorkspacesRepository } from '../repositories/workspaces.repository.interface';
import { Workspace } from '../entities/workspace.entity';
import { slugify } from '@shared/utils/slugify.util';
import { DEFAULT_ROLES, OWNER_ROLE } from '@modules/rbac/constants/roles';

interface CreateWorkspaceInput {
  userId: string;
  name: string;
  internalClientName: string;
  isPersonal?: boolean;
}

@Injectable()
export class CreateWorkspaceUseCase {
  constructor(private workspaces: WorkspacesRepository) {}

  async execute(input: CreateWorkspaceInput): Promise<Workspace> {
    const slug = `${slugify(input.name)}-${nanoid(6)}`;

    const result = await this.workspaces.createWithDefaults({
      name: input.name,
      slug,
      isPersonal: input.isPersonal ?? false,
      ownerId: input.userId,
      ownerRoleName: OWNER_ROLE,
      defaultRoles: DEFAULT_ROLES,
      internalClientName: input.internalClientName,
    });

    return result.workspace;
  }
}
