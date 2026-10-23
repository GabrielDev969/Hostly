// The API closes a robot socket that sends more than 20 messages per ping interval (30 s) with 4429. Every 2 s that is
// 15 telemetry messages plus the pong, under the limit; every 1 s it is 30 and the socket drops.
export const MIN_TELEMETRY_INTERVAL_S = 2;

export interface TimingFlags {
  'telemetry-interval'?: string;
  'close-after'?: string;
  'vanish-after'?: string;
}

export interface Timings {
  telemetryIntervalMs: number;
  closeAfterMs?: number;
  vanishAfterMs?: number;
}

export class InvalidOptionError extends Error {}

// A plain number of seconds, decimals allowed; anything else (empty, "abc", "-1", "1e3") is refused.
function parseSeconds(flag: string, value: string): number {
  const seconds = /^\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
  if (!Number.isFinite(seconds)) {
    throw new InvalidOptionError(`--${flag} must be a number of seconds, got "${value}"`);
  }
  return seconds;
}

function positiveMs(flag: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const seconds = parseSeconds(flag, value);
  if (seconds <= 0)
    throw new InvalidOptionError(`--${flag} must be more than 0 seconds, got "${value}"`);
  return seconds * 1000;
}

// Checked before pairing, so a bad flag never costs a pairing code.
export function parseTimings(flags: TimingFlags, defaultTelemetryIntervalMs: number): Timings {
  const telemetry = flags['telemetry-interval'];
  let telemetryIntervalMs = defaultTelemetryIntervalMs;
  if (telemetry !== undefined) {
    const seconds = parseSeconds('telemetry-interval', telemetry);
    if (seconds < MIN_TELEMETRY_INTERVAL_S) {
      throw new InvalidOptionError(
        `--telemetry-interval must be at least ${MIN_TELEMETRY_INTERVAL_S} seconds: the API closes sockets that ` +
          'send more than 20 messages per ping interval (4429)',
      );
    }
    telemetryIntervalMs = seconds * 1000;
  }
  return {
    telemetryIntervalMs,
    closeAfterMs: positiveMs('close-after', flags['close-after']),
    vanishAfterMs: positiveMs('vanish-after', flags['vanish-after']),
  };
}
