import { TransformFnParams } from 'class-transformer';

// The robot resolves the zone with a case-sensitive lookup, so store the canonical spelling
// (america/sao_paulo -> America/Sao_Paulo). Invalid values pass through for @IsTimeZone to reject.
export function canonicalTimeZone({ value }: TransformFnParams): unknown {
  if (typeof value !== 'string') return value;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value.trim() }).resolvedOptions().timeZone;
  } catch {
    return value;
  }
}
