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
} as const;

export const ALL_PERMISSION_KEYS: string[] = Object.values(PERMISSIONS).flatMap((group) =>
  Object.values(group),
);
