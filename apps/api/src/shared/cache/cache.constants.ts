export const CACHE_NS = {
  permissions: 'permissions',
  roles: 'roles',
  users: 'users',
  workspaceMembers: 'workspace_members',
  sessions: 'sessions',
  featureFlags: 'feature_flags',
} as const;

// Part of every cached key: bumping it leaves the values of an older format unread until their TTL runs out.
export const CACHE_VALUE_FORMAT = 'c2';

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
