import type { RobotMode } from '@hostly/contracts';

export const TELEMETRY_BUCKET_MINUTES = 5;
export const TELEMETRY_BUCKET_MS = TELEMETRY_BUCKET_MINUTES * 60 * 1000;
export const TELEMETRY_MAX_HOURS = 24;

export interface TelemetrySample {
  ts: Date;
  battery: number | null;
  charging: boolean | null;
  mode: RobotMode;
}

export interface TelemetryPoint {
  // Start of the bucket.
  at: Date;
  battery: number | null;
  charging: boolean | null;
  mode: RobotMode;
  samples: number;
}

export interface TelemetryWindow {
  from: Date;
  to: Date;
}

// Aligned to the buckets: `to` is the end of the current one, so the window holds exactly hours × 12 buckets.
export function telemetryWindow(now: Date, hours: number): TelemetryWindow {
  const to = new Date(
    Math.floor(now.getTime() / TELEMETRY_BUCKET_MS) * TELEMETRY_BUCKET_MS + TELEMETRY_BUCKET_MS,
  );
  return { from: new Date(to.getTime() - hours * 60 * 60 * 1000), to };
}

// The most frequent value; a tie goes to the one seen last.
function predominant<T>(values: readonly T[]): T | undefined {
  const counts = new Map<T, number>();
  let best: T | undefined;
  let bestCount = 0;
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count >= bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

// One point per 5-minute bucket that has samples: average battery, the charging state and mode most of them had.
// A bucket without samples yields no point, so a gap is time offline.
export function bucketTelemetry(
  samples: readonly TelemetrySample[],
  window: TelemetryWindow,
): TelemetryPoint[] {
  const buckets = new Map<number, TelemetrySample[]>();
  for (const sample of samples) {
    const ts = sample.ts.getTime();
    if (ts < window.from.getTime() || ts >= window.to.getTime()) continue;
    const index = Math.floor((ts - window.from.getTime()) / TELEMETRY_BUCKET_MS);
    const bucket = buckets.get(index);
    if (bucket) bucket.push(sample);
    else buckets.set(index, [sample]);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, bucket]) => {
      const ordered = [...bucket].sort((a, b) => a.ts.getTime() - b.ts.getTime());
      const batteries = ordered.flatMap((s) => (s.battery === null ? [] : [s.battery]));
      const charging = ordered.flatMap((s) => (s.charging === null ? [] : [s.charging]));
      return {
        at: new Date(window.from.getTime() + index * TELEMETRY_BUCKET_MS),
        battery: batteries.length
          ? Math.round(batteries.reduce((sum, value) => sum + value, 0) / batteries.length)
          : null,
        charging: predominant(charging) ?? null,
        mode: predominant(ordered.map((s) => s.mode))!,
        samples: ordered.length,
      };
    });
}
