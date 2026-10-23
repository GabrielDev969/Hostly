import { describe, expect, it } from 'vitest';
import { timeZoneGroups } from './timezones';

describe('timeZoneGroups', () => {
  it('puts São Paulo and UTC first and groups the region zones by area', () => {
    const groups = timeZoneGroups([
      'America/Sao_Paulo',
      'America/Manaus',
      'Europe/Lisbon',
      'America/Argentina/Buenos_Aires',
      'Etc/GMT+3',
      'EST',
      'GMT',
    ]);

    expect(groups).toEqual([
      { label: 'Mais usados', zones: ['America/Sao_Paulo', 'UTC'] },
      { label: 'América', zones: ['America/Manaus', 'America/Argentina/Buenos_Aires'] },
      { label: 'Europa', zones: ['Europe/Lisbon'] },
    ]);
  });

  it('keeps a saved zone the browser does not list', () => {
    expect(timeZoneGroups(['Europe/Lisbon'], 'America/Nuuk')[0]).toEqual({
      label: 'Mais usados',
      zones: ['America/Nuuk', 'America/Sao_Paulo', 'UTC'],
    });
    expect(timeZoneGroups(['Europe/Lisbon'], 'Europe/Lisbon')[0]!.zones).toEqual([
      'America/Sao_Paulo',
      'UTC',
    ]);
  });

  it("uses the browser's list by default, with no Etc zone", () => {
    const zones = timeZoneGroups().flatMap((group) => group.zones);
    expect(zones.slice(0, 2)).toEqual(['America/Sao_Paulo', 'UTC']);
    expect(zones.filter((zone) => zone === 'America/Sao_Paulo')).toHaveLength(1);
    expect(zones.some((zone) => zone.startsWith('Etc/'))).toBe(false);
  });
});
