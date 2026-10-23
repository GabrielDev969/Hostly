import type { Membership, Me } from '@/lib/session/session-provider';

// Mirrors DEFAULT_ROLES cut by PERMISSION_CEILING in apps/api/src/modules/rbac/constants/roles.ts.
// The API e2e (workspace-me.e2e-spec.ts) proves the same sets on the API side.
export const ROLE_PERMISSIONS = {
  operator_admin: [
    'audit:read',
    'client:create',
    'client:delete',
    'client:read',
    'client:update',
    'robot:move',
    'robot:pair',
    'robot:read',
    'robot:revoke',
    'robot:update',
    'role:assign',
    'role:create',
    'role:delete',
    'role:read',
    'role:update',
    'site:create',
    'site:delete',
    'site:read',
    'site:update',
    'user:create',
    'user:delete',
    'user:read',
    'user:update',
    'workspace:invite',
    'workspace:read',
    'workspace:remove_member',
    'workspace:transfer_ownership',
    'workspace:update',
  ],
  operator_staff: [
    'audit:read',
    'client:read',
    'robot:move',
    'robot:pair',
    'robot:read',
    'robot:update',
    'role:read',
    'site:read',
    'user:read',
    'workspace:read',
  ],
  client_admin: ['audit:read', 'client:read', 'robot:read', 'site:read', 'workspace:read'],
  client_editor: ['client:read', 'robot:read', 'site:read', 'workspace:read'],
  advertiser: ['workspace:read'],
} as const;

export type RoleName = keyof typeof ROLE_PERMISSIONS;

export const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
export const CLIENT_A = '22222222-2222-4222-8222-222222222222';
export const CLIENT_B = '33333333-3333-4333-8333-333333333333';
export const ADVERTISER_ID = '44444444-4444-4444-8444-444444444444';
export const USER_ID = '55555555-5555-4555-8555-555555555555';

export const ROLE_SCOPE: Record<RoleName, Membership['scope']> = {
  operator_admin: { kind: 'operator', clientId: null, advertiserId: null },
  operator_staff: { kind: 'operator', clientId: null, advertiserId: null },
  client_admin: { kind: 'client', clientId: CLIENT_A, advertiserId: null },
  client_editor: { kind: 'client', clientId: CLIENT_A, advertiserId: null },
  advertiser: { kind: 'advertiser', clientId: CLIENT_A, advertiserId: ADVERTISER_ID },
};

export function membershipFor(role: RoleName): Membership {
  return {
    workspaceId: WORKSPACE_ID,
    role: { id: `role-${role}`, name: role, isSystem: true },
    scope: ROLE_SCOPE[role],
    permissions: [...ROLE_PERMISSIONS[role]],
  };
}

export const ME: Me = {
  id: USER_ID,
  email: 'ana@example.com',
  name: 'Ana Souza',
  twoFactorEnabled: false,
  isSuperAdmin: false,
  workspaces: [
    { id: WORKSPACE_ID, name: 'Operadora Teste', slug: 'operadora-teste', isPersonal: false },
  ],
};

export const CLIENTS = [
  { id: CLIENT_A, name: 'Shopping Alfa', status: 'active', isInternal: false },
  { id: CLIENT_B, name: 'Shopping Beta', status: 'active', isInternal: false },
].map((client) => ({
  ...client,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
}));

// Unsigned JWT-shaped tokens: the panel only reads sub and iat; the API is what verifies them.
export function fakeToken(label: string, iat = 1_700_000_000, sub = USER_ID): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'none' })}.${encode({ sub, iat, label })}.signature`;
}
