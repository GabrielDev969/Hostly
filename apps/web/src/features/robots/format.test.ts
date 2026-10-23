import { describe, expect, it } from 'vitest';
import { formatBattery, formatMeters, radToDeg, relativeTime } from './format';
import { connectionOf, MODE_LABELS, STATUS_LABELS } from './labels';
import { segmentsOf } from './battery-chart';

describe('format', () => {
  it('turns radians into whole degrees', () => {
    expect(radToDeg(Math.PI / 2)).toBe(90);
    expect(radToDeg(-Math.PI)).toBe(-180);
    expect(radToDeg(-0.001)).toBe(0);
  });

  it('writes meters with two decimals, pt-BR', () => {
    expect(formatMeters(1.5)).toBe('1,50 m');
  });

  it('writes the battery or a dash', () => {
    expect(formatBattery(7)).toBe('7%');
    expect(formatBattery(null)).toBe('—');
  });

  it('says how long ago, in s, min, h and d', () => {
    const now = Date.parse('2026-10-23T12:00:00.000Z');
    const ago = (ms: number) => relativeTime(new Date(now - ms).toISOString(), now);
    expect(ago(0)).toBe('agora');
    expect(ago(12_000)).toBe('há 12 s');
    expect(ago(3 * 60_000)).toBe('há 3 min');
    expect(ago(2 * 3_600_000)).toBe('há 2 h');
    expect(ago(4 * 86_400_000)).toBe('há 4 d');
    expect(ago(-5_000)).toBe('agora');
  });
});

describe('labels', () => {
  it('names every mode and status in pt-BR', () => {
    expect(MODE_LABELS).toEqual({
      idle: 'Parado',
      promotion: 'Promoção',
      cruise: 'Cruzeiro',
      guide: 'Guia',
      reception: 'Recepção',
      base: 'Base',
      suspended: 'Suspenso',
    });
    expect(STATUS_LABELS).toEqual({ pending: 'Pendente', active: 'Ativo', revoked: 'Revogado' });
  });

  it('shows the status instead of the connection for a robot that is not active', () => {
    expect(connectionOf({ status: 'active', online: true }).label).toBe('Online');
    expect(connectionOf({ status: 'active', online: false }).label).toBe('Offline');
    expect(connectionOf({ status: 'pending', online: false }).label).toBe('Pendente');
  });
});

describe('battery chart segments', () => {
  const p = (at: string, battery: number | null) => ({
    at: `2026-10-23T${at}:00.000Z`,
    battery,
    charging: null,
    mode: 'cruise' as const,
    samples: 1,
  });

  it('breaks the line on a missing bucket and on a bucket without battery', () => {
    const segments = segmentsOf(
      [p('10:00', 90), p('10:05', 89), p('10:15', 80), p('10:20', null), p('10:25', 70)],
      5 * 60_000,
    );
    expect(segments.map((s) => s.map((r) => r.battery))).toEqual([[90, 89], [80], [70]]);
  });
});
