'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button, PageHeader } from '@/components/ui';
import { useWithClient } from '@/features/robots/hooks';
import { LiveRobotsProvider } from '@/features/robots/live/live-robots';
import { useClientFilter, type Client } from '@/features/shell/use-client-filter';
import { usePanelSession } from '@/lib/session/session-provider';
import { ClientFormDialog } from './client-form';
import { clientStatusOf, plural } from './labels';
import { clientsKey, useClientInventory, useClientsPermissions } from './queries';
import styles from './clients.module.css';

const DETAIL_PATH = /^\/clients\/([^/]+)/;

function ClientsList({ clients, selectedId }: { clients: Client[]; selectedId: string | null }) {
  const inventory = useClientInventory();
  const withClient = useWithClient();

  // One line per client; each part shows only with the permission to read it.
  const summary = (client: Client) =>
    [
      clientStatusOf(client).label,
      inventory.sites &&
        plural(inventory.sites.filter((s) => s.clientId === client.id).length, 'local', 'locais'),
      inventory.robots &&
        plural(inventory.robots.filter((r) => r.clientId === client.id).length, 'robô', 'robôs'),
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <nav aria-label="Clientes" className={styles.list}>
      <ul>
        {clients.map((client) => (
          <li key={client.id}>
            <Link
              href={withClient(`/clients/${client.id}`)}
              className={styles.listItem}
              aria-current={client.id === selectedId ? 'page' : undefined}
            >
              <span className={styles.listName}>{client.name}</span>
              <span className={styles.listSummary}>{summary(client)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ClientsBody({ children }: { children: ReactNode }) {
  const { workspace } = usePanelSession();
  const queryClient = useQueryClient();
  const { clients, isLoading, isError } = useClientFilter();
  const pathname = usePathname();
  const selectedId = DETAIL_PATH.exec(pathname)?.[1] ?? null;

  if (isLoading) return <LoadingState label="Carregando clientes…" />;
  if (isError) {
    return (
      <ErrorState
        onRetry={() => void queryClient.invalidateQueries({ queryKey: clientsKey(workspace.id) })}
      />
    );
  }
  if (clients.length === 0) {
    return (
      <div className={styles.panel}>
        <EmptyState
          title="Nenhum cliente ainda"
          description="Cadastre o primeiro estabelecimento para criar os locais e parear os robôs."
        />
      </div>
    );
  }
  return (
    // On a phone only one side shows: the list on /clients, the detail on /clients/<id>.
    <div className={styles.layout} data-selected={selectedId ? 'true' : undefined}>
      <ClientsList clients={clients} selectedId={selectedId} />
      <div className={styles.detailSide}>{children}</div>
    </div>
  );
}

// The Clients section: header, list and the open client. A client user never gets here (the shell shows NoAccess).
export function ClientsSection({ children }: { children: ReactNode }) {
  const permissions = useClientsPermissions();
  const router = useRouter();
  const withClient = useWithClient();
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');

  const body = <ClientsBody>{children}</ClientsBody>;
  return (
    <>
      <div className={styles.pageHeader}>
        <PageHeader
          title="Clientes"
          subtitle="Os estabelecimentos onde seus robôs trabalham, cada um com marca, locais e acessos próprios."
        />
        {permissions.canCreate && <Button onClick={() => setCreating(true)}>Novo cliente</Button>}
      </div>
      <p role="status" className={styles.notice}>
        {notice}
      </p>
      {/* Live robot status, like the Robots section; the ticket needs robot:read. */}
      {permissions.canReadRobots ? <LiveRobotsProvider>{body}</LiveRobotsProvider> : body}
      {creating && (
        <ClientFormDialog
          onClose={() => setCreating(false)}
          onDone={(saved, message) => {
            setCreating(false);
            setNotice(message);
            router.push(withClient(`/clients/${saved.id}`));
          }}
        />
      )}
    </>
  );
}

export function NoClientSelected() {
  return (
    <div className={[styles.panel, styles.placeholder].join(' ')}>
      <p className={styles.muted}>Escolha um cliente na lista.</p>
    </div>
  );
}
