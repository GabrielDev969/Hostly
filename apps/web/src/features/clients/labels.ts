import type { Client } from '@/features/shell/use-client-filter';

export const CLIENT_STATUS_LABELS: Record<Client['status'], string> = {
  onboarding: 'Implantação',
  active: 'Ativo',
  paused: 'Pausado',
};

export const CLIENT_STATUSES = Object.keys(CLIENT_STATUS_LABELS) as Client['status'][];

// The operator's own robots: always active, so it shows this instead of a status.
export const INTERNAL_LABEL = 'Robôs próprios';

export type ClientTone = 'active' | 'onboarding' | 'paused' | 'internal';

export function clientStatusOf(client: Pick<Client, 'status' | 'isInternal'>): {
  label: string;
  tone: ClientTone;
} {
  if (client.isInternal) return { label: INTERNAL_LABEL, tone: 'internal' };
  return { label: CLIENT_STATUS_LABELS[client.status], tone: client.status };
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
