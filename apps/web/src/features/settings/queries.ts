'use client';

import { useQuery } from '@tanstack/react-query';
import { unwrap, type Schemas } from '@/lib/api/client';
import { usePanelSession } from '@/lib/session/session-provider';

export type Member = Schemas['WorkspaceMemberResponseDto'];
export type Role = Schemas['RoleResponseDto'];
export type Invitation = Schemas['InvitationResponseDto'];
export type PairingLookup = Schemas['PairingLookupResponseDto'];

export const settingsKeys = {
  all: (workspaceId: string) => ['settings', workspaceId] as const,
  members: (workspaceId: string) => ['settings', workspaceId, 'members'] as const,
  invitations: (workspaceId: string) => ['settings', workspaceId, 'invitations'] as const,
  roles: (workspaceId: string) => ['settings', workspaceId, 'roles'] as const,
  workspace: (workspaceId: string) => ['settings', workspaceId, 'workspace'] as const,
};

// Comfort only: each block shows with its permission, and the API refuses without it.
export function useSettingsPermissions() {
  const { membership } = usePanelSession();
  const held = new Set(membership.permissions);
  const canReadRoles = held.has('role:read');
  return {
    canPair: held.has('robot:pair'),
    canReadUsers: held.has('user:read'),
    // Inviting and changing a role pick a role, so they need the role list too.
    canInvite: held.has('workspace:invite'),
    canInviteWithRole: held.has('workspace:invite') && canReadRoles,
    canAssignRole: held.has('role:assign') && canReadRoles,
    canRemove: held.has('workspace:remove_member'),
    canReadRoles,
    canEditDefaults: held.has('workspace:update'),
  };
}

export function useMembers() {
  const { workspace, api } = usePanelSession();
  return useQuery({
    queryKey: settingsKeys.members(workspace.id),
    queryFn: () =>
      unwrap(
        api().GET('/api/v1/workspaces/{workspaceId}/members', {
          params: { path: { workspaceId: workspace.id } },
        }),
      ),
  });
}

// The owner cannot be changed or removed (the API says 403), so the panel offers no action on that row.
export function useWorkspaceOwner() {
  const { workspace, api } = usePanelSession();
  const query = useQuery({
    queryKey: settingsKeys.workspace(workspace.id),
    queryFn: () =>
      unwrap(
        api().GET('/api/v1/workspaces/{workspaceId}', {
          params: { path: { workspaceId: workspace.id } },
        }),
      ),
  });
  return query.data?.ownerId;
}

export function useRoles(enabled: boolean) {
  const { workspace, api } = usePanelSession();
  const query = useQuery({
    queryKey: settingsKeys.roles(workspace.id),
    queryFn: () =>
      unwrap(
        api().GET('/api/v1/rbac/roles', {
          params: { header: { 'x-workspace-id': workspace.id } },
        }),
      ),
    enabled,
  });
  return { ...query, roles: query.data ?? [] };
}

export function useInvitations(enabled: boolean) {
  const { workspace, api } = usePanelSession();
  return useQuery({
    queryKey: settingsKeys.invitations(workspace.id),
    queryFn: () =>
      unwrap(
        api().GET('/api/v1/invitations', {
          params: { header: { 'x-workspace-id': workspace.id } },
        }),
      ),
    enabled,
  });
}
