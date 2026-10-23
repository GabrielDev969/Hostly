'use client';

import { useId } from 'react';
import { EmptyState, ErrorState, LoadingState, describeLoadError } from '@/components/states';
import { formatBattery, formatTime } from './format';
import { MODE_LABELS } from './labels';
import {
  HISTORY_HOURS,
  useRobotHistory,
  type TelemetryHistory,
  type TelemetryPoint,
} from './queries';
import styles from './robots.module.css';

const WIDTH = 640;
const HEIGHT = 200;
const PAD = { top: 12, right: 12, bottom: 28, left: 44 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;
const Y_TICKS = [0, 25, 50, 75, 100];
const HOUR_MS = 60 * 60 * 1000;
const X_TICK_EVERY_MS = 6 * HOUR_MS;

type Reading = TelemetryPoint & { battery: number };

const hasBattery = (point: TelemetryPoint): point is Reading => point.battery !== null;

// Runs of readings in consecutive buckets; a gap (offline, or no battery reported) starts a new run.
export function segmentsOf(points: readonly TelemetryPoint[], bucketMs: number): Reading[][] {
  const segments: Reading[][] = [];
  let current: Reading[] = [];
  let previousAt: number | null = null;
  for (const point of points) {
    const at = Date.parse(point.at);
    if (!hasBattery(point) || (previousAt !== null && at - previousAt > bucketMs)) {
      if (current.length) segments.push(current);
      current = [];
    }
    if (hasBattery(point)) current.push(point);
    previousAt = at;
  }
  if (current.length) segments.push(current);
  return segments;
}

// The last reading of each hour, for the table read instead of the chart.
export function hourlyReadings(points: readonly TelemetryPoint[]): Reading[] {
  const byHour = new Map<number, Reading>();
  for (const point of points.filter(hasBattery)) {
    byHour.set(Math.floor(Date.parse(point.at) / HOUR_MS), point);
  }
  return [...byHour.values()];
}

export function describeHistory(readings: readonly Reading[]): string {
  const last = readings[readings.length - 1]!;
  const min = readings.reduce((a, b) => (b.battery < a.battery ? b : a));
  const max = readings.reduce((a, b) => (b.battery > a.battery ? b : a));
  return (
    `Bateria nas últimas ${HISTORY_HOURS} h: última leitura ${formatBattery(last.battery)} às ${formatTime(last.at)}, ` +
    `mínima ${formatBattery(min.battery)} às ${formatTime(min.at)}, ` +
    `máxima ${formatBattery(max.battery)} às ${formatTime(max.at)}.`
  );
}

function Chart({ history }: { history: TelemetryHistory }) {
  const titleId = useId();
  const descId = useId();
  const from = Date.parse(history.from);
  const to = Date.parse(history.to);
  const bucketMs = history.bucketMinutes * 60 * 1000;
  const readings = history.points.filter(hasBattery);
  const xOf = (ms: number) => PAD.left + ((ms - from) / (to - from)) * PLOT_W;
  const x = (at: string) => xOf(Date.parse(at));
  const y = (battery: number) => PAD.top + (1 - battery / 100) * PLOT_H;
  const xTicks: number[] = [];
  for (let tick = Math.ceil(from / HOUR_MS) * HOUR_MS; tick <= to; tick += X_TICK_EVERY_MS) {
    xTicks.push(tick);
  }

  return (
    <>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
      >
        <title id={titleId}>Histórico de bateria</title>
        <desc id={descId}>{describeHistory(readings)}</desc>
        <g aria-hidden="true">
          {Y_TICKS.map((tick) => (
            <g key={tick}>
              <line
                className={styles.chartGrid}
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text
                className={styles.chartLabel}
                x={PAD.left - 8}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {tick}%
              </text>
            </g>
          ))}
          {xTicks.map((tick) => (
            <text
              key={tick}
              className={styles.chartLabel}
              x={xOf(tick)}
              y={HEIGHT - 8}
              textAnchor="middle"
            >
              {formatTime(tick)}
            </text>
          ))}
          {segmentsOf(history.points, bucketMs).map((segment) =>
            segment.length === 1 ? (
              <circle
                key={segment[0]!.at}
                className={styles.chartDot}
                cx={x(segment[0]!.at)}
                cy={y(segment[0]!.battery)}
                r={2.5}
              />
            ) : (
              <path
                key={segment[0]!.at}
                className={styles.chartLine}
                d={segment
                  .map(
                    (p, i) =>
                      `${i === 0 ? 'M' : 'L'}${x(p.at).toFixed(1)} ${y(p.battery).toFixed(1)}`,
                  )
                  .join(' ')}
              />
            ),
          )}
        </g>
      </svg>
      <details className={styles.chartTable}>
        <summary>Ver em tabela</summary>
        <div
          className={styles.tableWrap}
          tabIndex={0}
          role="region"
          aria-label="Tabela da bateria por hora"
        >
          <table className={styles.table}>
            <caption className="visually-hidden">Última leitura de bateria de cada hora</caption>
            <thead>
              <tr>
                <th scope="col">Hora</th>
                <th scope="col">Bateria</th>
                <th scope="col">Carregando</th>
                <th scope="col">Modo</th>
              </tr>
            </thead>
            <tbody>
              {hourlyReadings(history.points).map((point) => (
                <tr key={point.at}>
                  <td className={styles.mono}>{formatTime(point.at)}</td>
                  <td className={styles.mono}>{formatBattery(point.battery)}</td>
                  <td>{point.charging === null ? '—' : point.charging ? 'Sim' : 'Não'}</td>
                  <td>{MODE_LABELS[point.mode]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

export function BatteryHistory({ robotId }: { robotId: string }) {
  const history = useRobotHistory(robotId);
  if (history.isPending) return <LoadingState label="Carregando histórico…" />;
  if (history.isError) {
    return (
      <ErrorState
        description={describeLoadError(history.error)}
        onRetry={() => void history.refetch()}
      />
    );
  }
  if (!history.data.points.some(hasBattery)) {
    return <EmptyState title={`Sem telemetria nas últimas ${HISTORY_HOURS} h`} />;
  }
  return <Chart history={history.data} />;
}
