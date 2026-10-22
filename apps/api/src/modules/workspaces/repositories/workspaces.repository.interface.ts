import { Workspace } from '../entities/workspace.entity';

export interface CreateWorkspaceWithDefaultsData {
  name: string;
  slug: string;
  isPersonal: boolean;
  ownerId: string;
  defaultRoles: Array<{
    name: string;
    description?: string;
    isSystem: boolean;
    permissionKeys: string[];
  }>;
  ownerRoleName: string;
}

export interface CreateWorkspaceResult {
  workspace: Workspace;
  ownerRoleId: string;
}

export interface TransferOwnershipData {
  workspaceId: string;
  fromUserId: string;
  toUserId: string;
  ownerRoleId: string;
  adminRoleId: string;
}

export abstract class WorkspacesRepository {
  abstract createWithDefaults(
    data: CreateWorkspaceWithDefaultsData,
  ): Promise<CreateWorkspaceResult>;
  abstract findById(id: string): Promise<Workspace | null>;
  abstract findBySlug(slug: string): Promise<Workspace | null>;
  abstract findByUserId(userId: string): Promise<Workspace[]>;
  abstract update(id: string, data: Partial<Workspace>): Promise<Workspace>;
  abstract softDelete(id: string): Promise<void>;
  abstract transferOwnership(data: TransferOwnershipData): Promise<void>;
}
