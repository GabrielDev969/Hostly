'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { EMPTY } from '@/features/robots/format';
import { useNow } from '@/features/robots/hooks';
import { InviteDialog } from '@/features/settings/invitations';
import { roleLabel } from '@/features/settings/labels';
import { useInvitations, useMembers, useRoles } from '@/features/settings/queries';
import type { Client } from '@/features/shell/use-client-filter';
import { useClientsPermissions } from './queries';
import styles from './clients.module.css';

// Who of the client reaches the panel: its members, and the invitations still open for it. The operator's own
// team sees every client and is not listed.
export function ClientAccess({
  client,
  onNotice,
}: {
  client: Client;
  onNotice: (message: string) => void;
}) {
  const permissions = useClientsPermissions();
  const members = useMembers(permissions.canReadMembers);
  const invitations = useInvitations(permissions.canReadInvitations);
  const { roles } = useRoles(permissions.canReadRoles);
  // An invitation turns "expirado" while the page is open.
  const now = useNow(60_000);
  const [inviting, setInviting] = useState(false);

  const people = (members.data ?? []).filter((member) => member.clientId === client.id);
  const pending = (invitations.data ?? []).filter(
    (invitation) => invitation.clientId === client.id && invitation.acceptedAt === null,
  );
  const roleName = (id: string) => roles.find((role) => role.id === id)?.name;

  let body;
  if (members.isPending) {
    body = <p className={styles.muted}>Carregando acessos…</p>;
  } else if (members.isError) {
    body = <p className={styles.muted}>A lista de acessos não está disponível.</p>;
  } else if (people.length === 0 && pending.length === 0) {
    body = (
      <>
        <p>Só a sua equipe acessa.</p>
        <p className={styles.muted}>
          Quem é do cliente vê só os robôs, a mídia e os relatórios dele.
        </p>
      </>
    );
  } else {
    body = (
      <ul className={styles.people}>
        {people.map((member) => (
          <li key={member.id} className={styles.person}>
            <span className={styles.personName}>{member.user.name}</span>
            <span className={styles.muted}>{roleLabel(member.role.name)}</span>
          </li>
        ))}
        {pending.map((invitation) => {
          const name = roleName(invitation.roleId);
          const expired = Date.parse(invitation.expiresAt) <= now;
          return (
            <li key={invitation.id} className={styles.person}>
              <span className={styles.personName}>{invitation.email}</span>
              <span className={styles.muted}>
                {expired ? 'Convite expirado' : 'Convite pendente'} ·{' '}
                {name ? roleLabel(name) : EMPTY}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="client-access-title">
      <div className={styles.panelHeader}>
        <h2 id="client-access-title" className={styles.panelTitle}>
          Acessos do cliente
        </h2>
        {permissions.canInvite && <Button onClick={() => setInviting(true)}>Convidar</Button>}
      </div>
      {body}
      {inviting && (
        <InviteDialog
          roles={roles}
          clientId={client.id}
          onClose={() => setInviting(false)}
          onDone={(message) => {
            setInviting(false);
            onNotice(message);
          }}
        />
      )}
    </section>
  );
}
