import { EMPTY } from '@/features/robots/format';

export type MemberScope = 'operator' | 'client' | 'advertiser';

export const ROLE_LABELS: Record<string, string> = {
  operator_admin: 'Admin da operadora',
  operator_staff: 'Equipe da operadora',
  client_admin: 'Admin do cliente',
  client_editor: 'Editor do cliente',
  advertiser: 'Anunciante',
};

// A custom role shows its own name.
export function roleLabel(name: string): string {
  return ROLE_LABELS[name] ?? name;
}

// The system roles the panel grants, per scope. Advertiser invitations arrive with the Advertiser issue, and custom
// roles are not offered: the API decides whether one fits a scope.
export const GRANTABLE_ROLES: Record<Exclude<MemberScope, 'advertiser'>, readonly string[]> = {
  operator: ['operator_admin', 'operator_staff'],
  client: ['client_admin', 'client_editor'],
};

export function scopeOf(member: {
  clientId: string | null;
  advertiserId?: string | null;
}): MemberScope {
  if (member.advertiserId) return 'advertiser';
  return member.clientId ? 'client' : 'operator';
}

export function roleScope(name: string): Exclude<MemberScope, 'advertiser'> | null {
  if (GRANTABLE_ROLES.operator.includes(name)) return 'operator';
  if (GRANTABLE_ROLES.client.includes(name)) return 'client';
  return null;
}

// The "Enxerga" column: everything, the client's name, or the advertiser inside its client.
export function seesLabel(
  member: { clientId: string | null; advertiserId?: string | null },
  clientName: (id: string) => string | undefined,
): string {
  if (!member.clientId) return 'Tudo';
  const name = clientName(member.clientId) ?? EMPTY;
  return member.advertiserId ? `anunciante no ${name}` : name;
}
