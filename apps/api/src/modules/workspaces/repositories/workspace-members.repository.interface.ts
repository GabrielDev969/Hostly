import { WorkspaceMember } from '../entities/workspace-member.entity';

export interface CreateWorkspaceMemberData {
  userId: string;
  workspaceId: string;
  roleId: string;
  clientId?: string | null;
  advertiserId?: string | null;
}

export interface CreateFromInvitationData {
  invitationId: string;
  userId: string;
  workspaceId: string;
  roleId: string;
  clientId: string | null;
  now: Date;
}

export type CreateFromInvitationResult =
  | { status: 'created'; member: WorkspaceMember }
  | { status: 'client_gone' }
  | { status: 'not_pending' };

export interface WorkspaceMemberWithRelations extends WorkspaceMember {
  organizationId: string;
  role: {
    id: string;
    name: string;
    isSystem: boolean;
    permissions: string[];
  };
}

export interface WorkspaceMemberListItem extends WorkspaceMember {
  user: {
    id: string;
    email: string;
    name: string;
  };
  role: {
    id: string;
    name: string;
    isSystem: boolean;
  };
}

export abstract class WorkspaceMembersRepository {
  abstract create(data: CreateWorkspaceMemberData): Promise<WorkspaceMember>;
  // Creates the membership and closes the invitation atomically, while its client is still live.
  abstract createFromInvitation(
    data: CreateFromInvitationData,
  ): Promise<CreateFromInvitationResult>;
  abstract findById(id: string): Promise<WorkspaceMember | null>;
  abstract findByUserAndWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceMemberWithRelations | null>;
  abstract findSuperAdminMembership(userId: string): Promise<WorkspaceMemberWithRelations | null>;
  abstract findManyByWorkspaceWithRelations(
    workspaceId: string,
  ): Promise<WorkspaceMemberListItem[]>;
  abstract updateRole(id: string, roleId: string): Promise<WorkspaceMember>;
  abstract delete(id: string): Promise<void>;
}
