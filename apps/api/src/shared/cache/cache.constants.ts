export const CACHE_NS = {
  permissions: 'permissions',
  roles: 'roles',
  users: 'users',
  workspaceMembers: 'workspace_members',
  sessions: 'sessions',
  featureFlags: 'feature_flags',
} as const;

const seconds = (n: number) => n * 1_000;
const minutes = (n: number) => n * 60_000;
const hours = (n: number) => n * 60 * 60_000;

export const CACHE_TTL = {
  fifteenSeconds: seconds(15),
  oneMinute: minutes(1),
  fifteenMinutes: minutes(15),
  oneHour: hours(1),
  oneDay: hours(24),
} as const;
