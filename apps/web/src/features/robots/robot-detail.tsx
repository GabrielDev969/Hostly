'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { z } from 'zod';
import { EmptyState, ErrorState, LoadingState, describeLoadError } from '@/components/states';
import { Card, PageHeader } from '@/components/ui';
import { useClientFilter } from '@/features/shell/use-client-filter';
import { ApiError } from '@/lib/api/errors';
import { BatteryHistory } from './battery-chart';
import { EMPTY, formatDateTime, formatMeters, radToDeg, relativeTime } from './format';
import { useNow, useWithClient } from './hooks';
import { MODE_LABELS } from './labels';
import { LiveNotice } from './live/live-robots';
import { RobotActions } from './robot-actions';
import { BatteryValue, ConnectionBadge } from './robot-status';
import { useRobot, useSites, type Robot } from './queries';
import styles from './robots.module.css';

const robotIdSchema = z.uuid();

function LastContact({ at }: { at: string | null }) {
  const now = useNow();
  if (!at) return <>Nunca</>;
  return (
    <time dateTime={at} title={formatDateTime(at)}>
      {relativeTime(at, now)}
    </time>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.fieldRow}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Now({ robot }: { robot: Robot }) {
  const { clients } = useClientFilter();
  const { sites } = useSites();
  const telemetry = robot.telemetry;
  return (
    <section className={styles.panel} aria-labelledby="robot-now-title">
      <h2 id="robot-now-title" className={styles.panelTitle}>
        Agora
      </h2>
      {telemetry?.emergency && (
        <p className={styles.emergency} role="alert">
          Botão de emergência acionado
        </p>
      )}
      <dl className={styles.fields}>
        <Field label="Conexão">
          <ConnectionBadge robot={robot} />
        </Field>
        <Field label="Bateria">
          <BatteryValue telemetry={telemetry} />
        </Field>
        <Field label="Modo">{telemetry ? MODE_LABELS[telemetry.mode] : EMPTY}</Field>
        <Field label="Último contato">
          <LastContact at={robot.lastSeenAt} />
        </Field>
        <Field label="Cliente">{clients.find((c) => c.id === robot.clientId)?.name ?? EMPTY}</Field>
        <Field label="Local">{sites.find((s) => s.id === robot.siteId)?.name ?? EMPTY}</Field>
        <Field label="Versão do app">
          <span className={styles.mono}>{robot.appVersion ?? EMPTY}</span>
        </Field>
        <Field label="Versão da ROM">
          <span className={styles.mono}>{robot.romVersion ?? EMPTY}</span>
        </Field>
        <Field label="Manifesto">
          <span className={styles.mono}>{robot.manifestVersion ?? EMPTY}</span>
        </Field>
        <Field label="Série">
          <span className={styles.mono}>{robot.serial}</span>
        </Field>
      </dl>
    </section>
  );
}

function Position({ pose }: { pose: NonNullable<Robot['telemetry']>['pose'] | undefined }) {
  return (
    <section className={styles.panel} aria-labelledby="robot-position-title">
      <h2 id="robot-position-title" className={styles.panelTitle}>
        Posição
      </h2>
      {pose ? (
        <dl className={styles.fields}>
          <Field label="x">
            <span className={styles.mono}>{formatMeters(pose.x)}</span>
          </Field>
          <Field label="y">
            <span className={styles.mono}>{formatMeters(pose.y)}</span>
          </Field>
          <Field label="θ">
            <span className={styles.mono}>{radToDeg(pose.theta)}°</span>
          </Field>
        </dl>
      ) : (
        <p className={styles.muted}>Sem localização</p>
      )}
    </section>
  );
}

export function RobotDetail({ robotId }: { robotId: string }) {
  const valid = robotIdSchema.safeParse(robotId).success;
  const robot = useRobot(robotId, valid);
  const withClient = useWithClient();
  const back = (
    <p className={styles.back}>
      <Link href={withClient('/robots')}>← Robôs</Link>
    </p>
  );

  const notFound =
    !valid ||
    (robot.error instanceof ApiError && (robot.error.status === 400 || robot.error.status === 404));
  if (notFound) {
    return (
      <>
        {back}
        <Card>
          <EmptyState
            title="Robô não encontrado"
            description="Este robô não existe ou não está no seu acesso."
          />
        </Card>
      </>
    );
  }
  if (robot.isPending) return <LoadingState label="Carregando robô…" />;
  if (robot.isError) {
    return (
      <>
        {back}
        <ErrorState
          description={describeLoadError(robot.error)}
          onRetry={() => void robot.refetch()}
        />
      </>
    );
  }

  const data = robot.data;
  return (
    <>
      {back}
      <PageHeader title={data.name} subtitle="Status ao vivo do robô." />
      <LiveNotice />
      <div className={styles.grid}>
        <Now robot={data} />
        <Position pose={data.telemetry?.pose} />
        <section
          className={[styles.panel, styles.wide].join(' ')}
          aria-labelledby="robot-history-title"
        >
          <h2 id="robot-history-title" className={styles.panelTitle}>
            Histórico de bateria (24 h)
          </h2>
          <BatteryHistory robotId={data.id} />
        </section>
        <section className={styles.panel} aria-labelledby="robot-points-title">
          <h2 id="robot-points-title" className={styles.panelTitle}>
            Pontos do mapa
          </h2>
          <p className={styles.muted}>Em breve: os pontos chegam com o mapa do robô.</p>
        </section>
        <RobotActions robot={data} />
      </div>
    </>
  );
}
