import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { WorkspacesRepository } from '../repositories/workspaces.repository.interface';
import { Workspace } from '../entities/workspace.entity';
import { slugify } from '@shared/utils/slugify.util';
import { ALL_PERMISSION_KEYS } from '@modules/rbac/constants/permissions';

interface CreateWorkspaceInput {
  userId: string;
  name: string;
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
      ownerRoleName: 'Owner',
      defaultRoles: [
        {
          name: 'Owner',
          description: 'Full access to the workspace',
          isSystem: true,
          permissionKeys: ALL_PERMISSION_KEYS,
        },
        {
          name: 'Admin',
          description: 'Manage workspace without destructive actions',
          isSystem: true,
          permissionKeys: ALL_PERMISSION_KEYS.filter((k) => !k.includes(':delete')),
        },
        {
          name: 'Member',
          description: 'Standard member with read access',
          isSystem: true,
          permissionKeys: ALL_PERMISSION_KEYS.filter(
            (k) => k.endsWith(':read') || k === 'workspace:invite',
          ),
        },
      ],
    });

    return result.workspace;
  }
}
