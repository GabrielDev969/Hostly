'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { EmptyState, ErrorState, LoadingState, describeLoadError } from '@/components/states';
import { Card, PageHeader } from '@/components/ui';
import { useClientFilter } from '@/features/shell/use-client-filter';
import { EMPTY } from './format';
import { useWithClient } from './hooks';
import { MODE_LABELS } from './labels';
import { LiveNotice } from './live/live-robots';
import { useRobots, useSites } from './queries';
import { BatteryValue, ConnectionBadge } from './robot-status';
import styles from './robots.module.css';

export function RobotsList() {
  const { clientId, clients } = useClientFilter();
  const robots = useRobots(clientId);
  const { sites } = useSites();
  const withClient = useWithClient();

  // Names only: a missing one shows "—", never an id.
  const clientNames = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  const siteNames = useMemo(() => new Map(sites.map((s) => [s.id, s.name])), [sites]);

  let body;
  if (robots.isPending) {
    body = <LoadingState label="Carregando robôs…" />;
  } else if (robots.isError) {
    body = (
      <ErrorState
        description={describeLoadError(robots.error)}
        onRetry={() => void robots.refetch()}
      />
    );
  } else if (robots.data.length === 0) {
    body = (
      <EmptyState
        title={clientId ? 'Nenhum robô deste cliente' : 'Nenhum robô'}
        description="Os robôs aparecem aqui depois de pareados."
      />
    );
  } else {
    body = (
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Tabela de robôs">
        <table className={styles.table}>
          <caption className="visually-hidden">Robôs</caption>
          <thead>
            <tr>
              <th scope="col">Nome</th>
              <th scope="col">Cliente</th>
              <th scope="col">Local</th>
              <th scope="col">Conexão</th>
              <th scope="col">Bateria</th>
              <th scope="col">Modo</th>
              <th scope="col">Versão do app</th>
            </tr>
          </thead>
          <tbody>
            {robots.data.map((robot) => (
              <tr key={robot.id}>
                <th scope="row">
                  <Link href={withClient(`/robots/${robot.id}`)}>{robot.name}</Link>
                </th>
                <td>{clientNames.get(robot.clientId) ?? EMPTY}</td>
                <td>{siteNames.get(robot.siteId) ?? EMPTY}</td>
                <td>
                  <ConnectionBadge robot={robot} />
                </td>
                <td>
                  <BatteryValue telemetry={robot.telemetry} />
                </td>
                <td>{robot.telemetry ? MODE_LABELS[robot.telemetry.mode] : EMPTY}</td>
                <td className={styles.mono}>{robot.appVersion ?? EMPTY}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Robôs" subtitle="Status ao vivo da frota." />
      <LiveNotice />
      <Card>{body}</Card>
    </>
  );
}
