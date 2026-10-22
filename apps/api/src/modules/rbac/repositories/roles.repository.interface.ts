import { Role } from '../entities/role.entity';
import { Permission } from '../entities/permission.entity';

export interface CreateRoleData {
  name: string;
  description?: string;
  workspaceId: string;
  isSystem?: boolean;
  permissionKeys: string[];
}

export interface UpdateRoleData {
  name?: string;
  description?: string;
  permissionKeys?: string[];
}

export interface MembershipScope {
  clientId: string | null;
  advertiserId: string | null;
}

export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

export abstract class RolesRepository {
  abstract create(data: CreateRoleData): Promise<RoleWithPermissions>;
  abstract findById(id: string): Promise<RoleWithPermissions | null>;
  abstract findByIdInWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<RoleWithPermissions | null>;
  abstract findManyByWorkspace(workspaceId: string): Promise<RoleWithPermissions[]>;
  abstract findByNameInWorkspace(name: string, workspaceId: string): Promise<Role | null>;
  abstract update(id: string, data: UpdateRoleData): Promise<RoleWithPermissions>;
  abstract delete(id: string): Promise<void>;
  abstract countMembersUsingRole(roleId: string): Promise<number>;
  abstract findMembershipScopesUsingRole(roleId: string): Promise<MembershipScope[]>;
}
