'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { useWithClient } from '@/features/robots/hooks';
import { LiveNotice } from '@/features/robots/live/live-robots';
import type { Site } from '@/features/robots/queries';
import { ConnectionBadge } from '@/features/robots/robot-status';
import type { Client } from '@/features/shell/use-client-filter';
import { useClientInventory, useClientsPermissions } from './queries';
import { SiteFormDialog } from './site-form';
import styles from './clients.module.css';

type Open = { kind: 'create' } | { kind: 'edit'; site: Site } | null;

// The client's sites, each with the robots linked to it. Robot status is live: the section sits inside the live
// provider of the Clients layout, which reloads the REST list on every (re)connect.
export function ClientSites({
  client,
  onNotice,
}: {
  client: Client;
  onNotice: (message: string) => void;
}) {
  const permissions = useClientsPermissions();
  const inventory = useClientInventory();
  const withClient = useWithClient();
  const [open, setOpen] = useState<Open>(null);

  const sites = (inventory.sites ?? []).filter((site) => site.clientId === client.id);
  const robotsOf = (siteId: string) =>
    (inventory.robots ?? []).filter((robot) => robot.siteId === siteId);

  let body;
  if (inventory.sitesError) {
    body = <p className={styles.muted}>A lista de locais não está disponível.</p>;
  } else if (sites.length === 0) {
    body = <p className={styles.muted}>Nenhum local ainda.</p>;
  } else {
    body = (
      <ul className={styles.sites}>
        {sites.map((site) => {
          const robots = robotsOf(site.id);
          return (
            <li key={site.id} className={styles.site}>
              <div className={styles.siteHeader}>
                <div>
                  <h3 className={styles.siteName}>{site.name}</h3>
                  <p className={styles.siteMeta}>
                    <span className={styles.mono}>{site.timezone}</span>
                    {site.address && <> · {site.address}</>}
                  </p>
                </div>
                {permissions.canUpdateSite && (
                  <Button
                    variant="secondary"
                    aria-label={`Editar o local ${site.name}`}
                    onClick={() => setOpen({ kind: 'edit', site })}
                  >
                    Editar
                  </Button>
                )}
              </div>
              {inventory.robots !== null &&
                (inventory.robotsError ? (
                  <p className={styles.muted}>A lista de robôs não está disponível.</p>
                ) : robots.length === 0 ? (
                  <p className={styles.muted}>Nenhum robô ligado ainda.</p>
                ) : (
                  <ul className={styles.robots} aria-label={`Robôs em ${site.name}`}>
                    {robots.map((robot) => (
                      <li key={robot.id} className={styles.robot}>
                        <Link href={withClient(`/robots/${robot.id}`)}>{robot.name}</Link>
                        <ConnectionBadge robot={robot} />
                      </li>
                    ))}
                  </ul>
                ))}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="client-sites-title">
      <div className={styles.panelHeader}>
        <h2 id="client-sites-title" className={styles.panelTitle}>
          Locais e robôs
        </h2>
        {permissions.canCreateSite && (
          <Button onClick={() => setOpen({ kind: 'create' })}>Novo local</Button>
        )}
      </div>
      {inventory.robots !== null && <LiveNotice />}
      {body}
      {open && (
        <SiteFormDialog
          clientId={client.id}
          site={open.kind === 'edit' ? open.site : undefined}
          onClose={() => setOpen(null)}
          onDone={(message) => {
            setOpen(null);
            onNotice(message);
          }}
        />
      )}
    </section>
  );
}
