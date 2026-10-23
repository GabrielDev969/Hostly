import { TransformFnParams } from 'class-transformer';
import { ValidateBy, ValidationOptions } from 'class-validator';

// Area/Location, as in the IANA region zones; Etc/* (offsets and UTC aliases) stays out.
const REGION_FORM = /^(?!etc\/)[a-z]+(?:\/[a-z0-9_+-]+)+$/i;
const REGION_ZONES: ReadonlySet<string> = new Set(Intl.supportedValuesOf('timeZone'));

// The robot resolves the zone with a case-sensitive lookup, so store the canonical spelling
// (america/sao_paulo -> America/Sao_Paulo). Only region zones and UTC are canonicalized: ICU would
// also turn EST into America/Panama and keep +03:00, which the robot's Java TimeZone reads as GMT.
// Anything else passes through untouched for @IsRegionTimeZone to reject.
export function canonicalTimeZone({ value }: TransformFnParams): unknown {
  if (typeof value !== 'string') return value;
  const zone = value.trim();
  if (zone.toUpperCase() === 'UTC') return 'UTC';
  if (!REGION_FORM.test(zone)) return value;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return value;
  }
}

export function isRegionTimeZone(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return value === 'UTC' || (REGION_FORM.test(value) && REGION_ZONES.has(value));
}

export function IsRegionTimeZone(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isRegionTimeZone',
      validator: {
        validate: (value: unknown) => isRegionTimeZone(value),
        defaultMessage: () =>
          '$property must be an IANA region time zone such as America/Sao_Paulo, or UTC',
      },
    },
    options,
  );
}
