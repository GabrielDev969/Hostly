export const PERMISSIONS = {
  USER: {
    READ: 'user:read',
    CREATE: 'user:create',
    UPDATE: 'user:update',
    DELETE: 'user:delete',
  },
  WORKSPACE: {
    READ: 'workspace:read',
    UPDATE: 'workspace:update',
    DELETE: 'workspace:delete',
    INVITE: 'workspace:invite',
    REMOVE_MEMBER: 'workspace:remove_member',
    TRANSFER_OWNERSHIP: 'workspace:transfer_ownership',
  },
  ROLE: {
    READ: 'role:read',
    CREATE: 'role:create',
    UPDATE: 'role:update',
    DELETE: 'role:delete',
    ASSIGN: 'role:assign',
  },
  AUDIT: {
    READ: 'audit:read',
  },
  CLIENT: {
    READ: 'client:read',
    CREATE: 'client:create',
    UPDATE: 'client:update',
    DELETE: 'client:delete',
  },
  SITE: {
    READ: 'site:read',
    CREATE: 'site:create',
    UPDATE: 'site:update',
    DELETE: 'site:delete',
  },
} as const;

export const ALL_PERMISSION_KEYS: string[] = Object.values(PERMISSIONS).flatMap((group) =>
  Object.values(group),
);
