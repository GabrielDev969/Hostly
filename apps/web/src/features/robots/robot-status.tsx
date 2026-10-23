import { formatBattery } from './format';
import { connectionOf } from './labels';
import type { Robot } from './queries';
import styles from './robots.module.css';

// Text and a dot, never color alone.
export function ConnectionBadge({ robot }: { robot: Pick<Robot, 'status' | 'online'> }) {
  const { label, tone } = connectionOf(robot);
  return (
    <span className={[styles.badge, styles[tone]].join(' ')}>
      <span className={styles.dot} aria-hidden="true" />
      {label}
    </span>
  );
}

export function BatteryValue({ telemetry }: { telemetry: Robot['telemetry'] }) {
  return (
    <span className={styles.mono}>
      {formatBattery(telemetry?.battery)}
      {telemetry?.charging && <span className={styles.charging}> carregando</span>}
    </span>
  );
}
