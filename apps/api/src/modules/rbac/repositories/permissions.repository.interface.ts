import { Permission } from '../entities/permission.entity';

export interface CreatePermissionData {
  workspaceId: string;
  key: string;
  description?: string | null;
  category: string;
}

export abstract class PermissionsRepository {
  abstract findAll(): Promise<Permission[]>;
  abstract findByKey(key: string): Promise<Permission | null>;
  abstract findManyByKeys(keys: string[]): Promise<Permission[]>;
  abstract findByCategory(category: string): Promise<Permission[]>;

  abstract findByKeyInScope(key: string, workspaceId: string): Promise<Permission | null>;
  abstract findManyByKeysInScope(keys: string[], workspaceId: string): Promise<Permission[]>;
  abstract findAllForWorkspace(workspaceId: string): Promise<Permission[]>;
  abstract findByIdInWorkspace(id: string, workspaceId: string): Promise<Permission | null>;
  abstract create(data: CreatePermissionData): Promise<Permission>;
  abstract delete(id: string): Promise<void>;
}
