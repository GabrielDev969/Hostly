import type { Client } from '@/features/shell/use-client-filter';
import { clientStatusOf } from './labels';
import styles from './clients.module.css';

// Text and a dot, never color alone.
export function ClientStatusBadge({ client }: { client: Pick<Client, 'status' | 'isInternal'> }) {
  const { label, tone } = clientStatusOf(client);
  return (
    <span className={[styles.badge, styles[tone]].join(' ')}>
      <span className={styles.dot} aria-hidden="true" />
      {label}
    </span>
  );
}
