import { BadRequestException } from '@nestjs/common';
import { ALL_PERMISSION_KEYS, PERMISSIONS } from './permissions';

export const HOSTLY_ROLES = {
  OPERATOR_ADMIN: 'operator_admin',
  OPERATOR_STAFF: 'operator_staff',
  CLIENT_ADMIN: 'client_admin',
  CLIENT_EDITOR: 'client_editor',
  ADVERTISER: 'advertiser',
} as const;

export type HostlyRole = (typeof HOSTLY_ROLES)[keyof typeof HOSTLY_ROLES];

export type ScopeKind = 'operator' | 'client' | 'advertiser';

const ROLE_SCOPE: Record<HostlyRole, ScopeKind> = {
  operator_admin: 'operator',
  operator_staff: 'operator',
  client_admin: 'client',
  client_editor: 'client',
  advertiser: 'advertiser',
};

export interface DefaultRole {
  name: HostlyRole;
  description: string;
  isSystem: boolean;
  permissionKeys: string[];
}

// Business permissions (clients, robots, media...) are added by the issues that create them.
export const DEFAULT_ROLES: DefaultRole[] = [
  {
    name: HOSTLY_ROLES.OPERATOR_ADMIN,
    description: 'Operator administrator: everything in the organization',
    isSystem: true,
    permissionKeys: ALL_PERMISSION_KEYS.filter((k) => k !== PERMISSIONS.WORKSPACE.DELETE),
  },
  {
    name: HOSTLY_ROLES.OPERATOR_STAFF,
    description: 'Operator staff: reads everything, manages no users or roles',
    isSystem: true,
    permissionKeys: [
      PERMISSIONS.USER.READ,
      PERMISSIONS.WORKSPACE.READ,
      PERMISSIONS.ROLE.READ,
      PERMISSIONS.AUDIT.READ,
    ],
  },
  {
    name: HOSTLY_ROLES.CLIENT_ADMIN,
    description: 'Client administrator: only their own client',
    isSystem: true,
    permissionKeys: [PERMISSIONS.WORKSPACE.READ, PERMISSIONS.AUDIT.READ],
  },
  {
    name: HOSTLY_ROLES.CLIENT_EDITOR,
    description: 'Client editor: only their own client, no settings',
    isSystem: true,
    permissionKeys: [PERMISSIONS.WORKSPACE.READ],
  },
  {
    name: HOSTLY_ROLES.ADVERTISER,
    description: 'Advertiser: only their own campaigns',
    isSystem: true,
    permissionKeys: [PERMISSIONS.WORKSPACE.READ],
  },
];

export const OWNER_ROLE = HOSTLY_ROLES.OPERATOR_ADMIN;

export function scopeKindOf(membership: {
  clientId: string | null;
  advertiserId: string | null;
}): ScopeKind {
  if (membership.advertiserId) return 'advertiser';
  if (membership.clientId) return 'client';
  return 'operator';
}

// Custom roles take the scope of the membership; system roles must match it.
export function assertRoleFitsScope(
  roleName: string,
  membership: { clientId: string | null; advertiserId: string | null },
): void {
  const expected = ROLE_SCOPE[roleName as HostlyRole] as ScopeKind | undefined;
  if (!expected) return;
  const actual = scopeKindOf(membership);
  if (expected !== actual) {
    throw new BadRequestException(
      `Role ${roleName} requires a ${expected} membership, but this one is ${actual}-scoped`,
    );
  }
}
