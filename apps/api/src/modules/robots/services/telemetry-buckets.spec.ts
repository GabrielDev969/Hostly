import {
  bucketTelemetry,
  telemetryWindow,
  TELEMETRY_BUCKET_MS,
  type TelemetrySample,
} from './telemetry-buckets';

const NOW = new Date('2026-10-23T12:07:30.000Z');

describe('telemetryWindow', () => {
  it('ends at the end of the current 5-minute bucket and spans the hours asked', () => {
    const window = telemetryWindow(NOW, 24);

    expect(window.to.toISOString()).toBe('2026-10-23T12:10:00.000Z');
    expect(window.from.toISOString()).toBe('2026-10-22T12:10:00.000Z');
    expect((window.to.getTime() - window.from.getTime()) / TELEMETRY_BUCKET_MS).toBe(288);
  });
});

describe('bucketTelemetry', () => {
  const window = telemetryWindow(NOW, 1);
  const at = (iso: string) => new Date(iso);
  const sample = (iso: string, over: Partial<TelemetrySample> = {}): TelemetrySample => ({
    ts: at(iso),
    battery: 80,
    charging: false,
    mode: 'cruise',
    ...over,
  });

  it('averages the battery per bucket, rounded, starting each point at its bucket', () => {
    const points = bucketTelemetry(
      [
        sample('2026-10-23T11:30:10.000Z', { battery: 81 }),
        sample('2026-10-23T11:34:59.999Z', { battery: 80 }),
        sample('2026-10-23T11:35:00.000Z', { battery: 70 }),
      ],
      window,
    );

    expect(points).toEqual([
      {
        at: at('2026-10-23T11:30:00.000Z'),
        battery: 81,
        charging: false,
        mode: 'cruise',
        samples: 2,
      },
      {
        at: at('2026-10-23T11:35:00.000Z'),
        battery: 70,
        charging: false,
        mode: 'cruise',
        samples: 1,
      },
    ]);
  });

  it('skips null batteries and gives null when none was reported', () => {
    const points = bucketTelemetry(
      [
        sample('2026-10-23T11:30:00.000Z', { battery: null, charging: null }),
        sample('2026-10-23T11:31:00.000Z', { battery: 60, charging: null }),
        sample('2026-10-23T11:40:00.000Z', { battery: null, charging: null }),
      ],
      window,
    );

    expect(points.map((p) => [p.battery, p.charging])).toEqual([
      [60, null],
      [null, null],
    ]);
  });

  it('takes the mode and charging state most samples had, a tie going to the latest', () => {
    const [point] = bucketTelemetry(
      [
        sample('2026-10-23T11:30:00.000Z', { mode: 'cruise', charging: true }),
        sample('2026-10-23T11:31:00.000Z', { mode: 'base', charging: true }),
        sample('2026-10-23T11:32:00.000Z', { mode: 'base', charging: false }),
        sample('2026-10-23T11:33:00.000Z', { mode: 'cruise', charging: false }),
        sample('2026-10-23T11:34:00.000Z', { mode: 'promotion', charging: false }),
      ],
      window,
    );

    expect(point).toMatchObject({ mode: 'cruise', charging: false, samples: 5 });
  });

  it('leaves out samples outside the window and empty buckets', () => {
    const points = bucketTelemetry(
      [
        sample('2026-10-23T11:09:59.999Z'),
        sample('2026-10-23T11:10:00.000Z'),
        sample('2026-10-23T12:05:00.000Z'),
        sample('2026-10-23T12:10:00.000Z'),
      ],
      window,
    );

    expect(points.map((p) => p.at.toISOString())).toEqual([
      '2026-10-23T11:10:00.000Z',
      '2026-10-23T12:05:00.000Z',
    ]);
  });

  it('never yields more than 288 points for 24 hours of telemetry every 10 s', () => {
    const day = telemetryWindow(NOW, 24);
    const samples: TelemetrySample[] = [];
    for (let ts = day.from.getTime() - 60_000; ts < day.to.getTime() + 60_000; ts += 10_000) {
      samples.push(sample(new Date(ts).toISOString()));
    }

    const points = bucketTelemetry(samples, day);

    expect(points).toHaveLength(288);
    expect(points.every((p) => p.samples === 30)).toBe(true);
  });
});
