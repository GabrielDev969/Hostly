import type { RobotMode } from '@hostly/contracts';
import type { Robot } from './queries';

export const MODE_LABELS: Record<RobotMode, string> = {
  idle: 'Parado',
  promotion: 'Promoção',
  cruise: 'Cruzeiro',
  guide: 'Guia',
  reception: 'Recepção',
  base: 'Base',
  suspended: 'Suspenso',
};

export const STATUS_LABELS: Record<Robot['status'], string> = {
  pending: 'Pendente',
  active: 'Ativo',
  revoked: 'Revogado',
};

export type ConnectionTone = 'online' | 'offline' | 'inactive';

// A robot that is not active has no connection to speak of: its status says why.
export function connectionOf(robot: Pick<Robot, 'status' | 'online'>): {
  label: string;
  tone: ConnectionTone;
} {
  if (robot.status !== 'active') return { label: STATUS_LABELS[robot.status], tone: 'inactive' };
  return robot.online ? { label: 'Online', tone: 'online' } : { label: 'Offline', tone: 'offline' };
}
