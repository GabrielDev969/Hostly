// The shape the API accepts (apps/api/src/modules/sites/http/dto/canonical-time-zone.ts): Area/Location region
// zones, never Etc/*, plus UTC. The API has the last word; this only builds the list to choose from.
const REGION_FORM = /^(?!etc\/)[a-z]+(?:\/[a-z0-9_+-]+)+$/i;

export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';
export const UTC = 'UTC';

const AREA_LABELS: Record<string, string> = {
  Africa: 'África',
  America: 'América',
  Antarctica: 'Antártida',
  Arctic: 'Ártico',
  Asia: 'Ásia',
  Atlantic: 'Atlântico',
  Australia: 'Austrália',
  Europe: 'Europa',
  Indian: 'Índico',
  Pacific: 'Pacífico',
};

export interface TimeZoneGroup {
  label: string;
  zones: string[];
}

// São Paulo and UTC first, then the browser's region zones by area. A zone already saved that the browser does not
// list (another ICU version) stays on top, so editing a site never swaps it by accident.
export function timeZoneGroups(
  available: readonly string[] = Intl.supportedValuesOf('timeZone'),
  current?: string,
): TimeZoneGroup[] {
  const first = [DEFAULT_TIME_ZONE, UTC];
  const regions = available.filter((zone) => REGION_FORM.test(zone) && !first.includes(zone));
  if (current && !first.includes(current) && !regions.includes(current)) first.unshift(current);

  const byArea = new Map<string, string[]>();
  for (const zone of regions) {
    const area = zone.split('/')[0]!;
    byArea.set(area, [...(byArea.get(area) ?? []), zone]);
  }
  return [
    { label: 'Mais usados', zones: first },
    ...[...byArea].map(([area, zones]) => ({ label: AREA_LABELS[area] ?? area, zones })),
  ];
}
