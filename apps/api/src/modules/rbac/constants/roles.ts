import { BadRequestException, ForbiddenException } from '@nestjs/common';
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

interface ScopeIds {
  clientId: string | null;
  advertiserId: string | null;
}

// Highest set of permissions a membership of each scope kind may hold, whatever role it gets.
// Operator memberships are unbounded; client and advertiser ones never reach user, role or invite
// permissions, which is what keeps operator-only endpoints (and their raw queries) operator-only.
export const PERMISSION_CEILING: Record<ScopeKind, ReadonlySet<string> | 'any'> = {
  operator: 'any',
  client: new Set([PERMISSIONS.WORKSPACE.READ, PERMISSIONS.AUDIT.READ]),
  advertiser: new Set([PERMISSIONS.WORKSPACE.READ]),
};

export function scopeKindOf(membership: ScopeIds): ScopeKind {
  if (membership.advertiserId) return 'advertiser';
  if (membership.clientId) return 'client';
  return 'operator';
}

// System roles must match the membership kind; every role must fit under the kind's ceiling.
export function assertRoleFitsScope(
  role: { name: string; permissions: ReadonlyArray<{ key: string }> },
  membership: ScopeIds,
): void {
  const actual = scopeKindOf(membership);
  const expected = ROLE_SCOPE[role.name as HostlyRole] as ScopeKind | undefined;
  if (expected && expected !== actual) {
    throw new BadRequestException(
      `Role ${role.name} requires a ${expected} membership, but this one is ${actual}-scoped`,
    );
  }
  const ceiling = PERMISSION_CEILING[actual];
  if (ceiling === 'any') return;
  const excess = role.permissions.map((p) => p.key).filter((key) => !ceiling.has(key));
  if (excess.length > 0) {
    throw new BadRequestException(
      `Role ${role.name} grants ${excess.join(', ')}, which a ${actual} membership cannot hold`,
    );
  }
}

// Only operators grant operator-scoped roles; anyone else grants only inside their own client
// (and advertisers only inside their own advertiser).
export function assertCanGrant(grantor: ScopeIds | null, membership: ScopeIds): void {
  if (!grantor) throw new ForbiddenException('Granting a role requires a tenant scope');
  if (scopeKindOf(grantor) === 'operator') return;
  const sameClient = membership.clientId !== null && membership.clientId === grantor.clientId;
  const sameAdvertiser = !grantor.advertiserId || membership.advertiserId === grantor.advertiserId;
  if (!sameClient || !sameAdvertiser) {
    throw new ForbiddenException('Only operators can grant roles outside their own scope');
  }
}

export function assertCanManageRoles(grantor: ScopeIds | null): void {
  if (!grantor || scopeKindOf(grantor) !== 'operator') {
    throw new ForbiddenException('Only operators can manage roles');
  }
}
