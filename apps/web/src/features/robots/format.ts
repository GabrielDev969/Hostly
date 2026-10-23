const decimal = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

export const EMPTY = '—';

export function formatBattery(battery: number | null | undefined): string {
  return battery === null || battery === undefined ? EMPTY : `${battery}%`;
}

export function formatMeters(value: number): string {
  return `${decimal.format(value)} m`;
}

// The robot reports theta in radians; people read degrees.
export function radToDeg(theta: number): number {
  return Math.round((theta * 180) / Math.PI) || 0;
}

export function formatTime(value: string | number | Date): string {
  return time.format(new Date(value));
}

export function formatDateTime(value: string | number | Date): string {
  return dateTime.format(new Date(value));
}

// "há 12 s", "há 3 min", "há 2 h", "há 4 d".
export function relativeTime(value: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(value)) / 1000));
  if (seconds < 1) return 'agora';
  if (seconds < 60) return `há ${seconds} s`;
  if (seconds < 3600) return `há ${Math.floor(seconds / 60)} min`;
  if (seconds < 86_400) return `há ${Math.floor(seconds / 3600)} h`;
  return `há ${Math.floor(seconds / 86_400)} d`;
}
