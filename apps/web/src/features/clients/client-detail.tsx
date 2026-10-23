'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { EmptyState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui';
import { useWithClient } from '@/features/robots/hooks';
import { useClientFilter } from '@/features/shell/use-client-filter';
import { ClientAccess } from './client-access';
import { ClientFormDialog } from './client-form';
import { ClientSites } from './client-sites';
import { ClientStatusBadge } from './client-status';
import { useClientInventory, useClientsPermissions } from './queries';
import styles from './clients.module.css';

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.stat}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// Numbers the API does not have yet: displays (phase 2), advertisers (#57) and the contract (no field).
function Soon() {
  return <span className={styles.soon}>Em breve</span>;
}

// One client, from the list the page already holds: an id it does not have is gone or out of scope.
export function ClientDetail({ clientId }: { clientId: string }) {
  const { clients, isLoading } = useClientFilter();
  const permissions = useClientsPermissions();
  const inventory = useClientInventory();
  const withClient = useWithClient();
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');

  const client = clients.find((c) => c.id === clientId);
  const back = (
    <p className={styles.back}>
      <Link href={withClient('/clients')}>← Clientes</Link>
    </p>
  );
  if (!client) {
    if (isLoading) return <LoadingState label="Carregando cliente…" />;
    return (
      <>
        {back}
        <div className={styles.panel}>
          <EmptyState
            title="Cliente não encontrado"
            description="Ele pode ter sido apagado. Escolha outro na lista."
          />
        </div>
      </>
    );
  }

  const siteCount = inventory.sites?.filter((site) => site.clientId === client.id).length;
  const robotCount = inventory.robots?.filter((robot) => robot.clientId === client.id).length;

  return (
    <div className={styles.detail}>
      {back}
      <section className={styles.panel} aria-labelledby="client-title">
        <div className={styles.panelHeader}>
          <div className={styles.identity}>
            <h2 id="client-title" className={styles.clientName}>
              {client.name}
            </h2>
            <ClientStatusBadge client={client} />
          </div>
          {permissions.canUpdate && (
            <Button
              variant="secondary"
              aria-label={`Editar o cliente ${client.name}`}
              onClick={() => setEditing(true)}
            >
              Editar
            </Button>
          )}
        </div>
        <dl className={styles.stats}>
          {robotCount !== undefined && <Stat label="Robôs">{robotCount}</Stat>}
          {siteCount !== undefined && <Stat label="Locais">{siteCount}</Stat>}
          <Stat label="Exibições no mês">
            <Soon />
          </Stat>
          <Stat label="Anunciantes">
            <Soon />
          </Stat>
          <Stat label="Contrato">
            <Soon />
          </Stat>
        </dl>
      </section>
      <p role="status" className={styles.notice}>
        {notice}
      </p>
      {permissions.canReadSites && <ClientSites client={client} onNotice={setNotice} />}
      {/* Nobody is invited into the internal client: operator members already see its robots. */}
      {permissions.canReadMembers && !client.isInternal && (
        <ClientAccess client={client} onNotice={setNotice} />
      )}
      {editing && (
        <ClientFormDialog
          client={client}
          onClose={() => setEditing(false)}
          onDone={(_saved, message) => {
            setEditing(false);
            setNotice(message);
          }}
        />
      )}
    </div>
  );
}
