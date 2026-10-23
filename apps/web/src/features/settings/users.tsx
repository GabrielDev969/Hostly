'use client';

import { useMemo, useState } from 'react';
import { ErrorState, LoadingState, describeLoadError } from '@/components/states';
import { Button } from '@/components/ui';
import { useClientFilter } from '@/features/shell/use-client-filter';
import { usePanelSession } from '@/lib/session/session-provider';
import { InviteDialog, PendingInvitations } from './invitations';
import { roleLabel, seesLabel } from './labels';
import { ChangeRoleDialog, RemoveMemberDialog, rolesFor } from './member-dialogs';
import {
  useMembers,
  useRoles,
  useSettingsPermissions,
  useWorkspaceOwner,
  type Member,
} from './queries';
import styles from './settings.module.css';

type Open = { kind: 'invite' } | { kind: 'role' | 'remove'; member: Member } | null;

export function UsersSection() {
  const { user } = usePanelSession();
  const permissions = useSettingsPermissions();
  const members = useMembers();
  const ownerId = useWorkspaceOwner();
  const { roles } = useRoles(permissions.canReadRoles);
  const { clients } = useClientFilter();
  const [open, setOpen] = useState<Open>(null);
  const [notice, setNotice] = useState('');

  const clientNames = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  const clientName = (id: string) => clientNames.get(id);
  const done = (message: string) => {
    setOpen(null);
    setNotice(message);
  };

  // The owner cannot be changed or removed, and nobody here changes or removes themselves. While the owner is
  // unknown, no row offers an action.
  const actionsFor = (member: Member) => {
    const locked = ownerId === undefined || member.userId === ownerId || member.userId === user.id;
    return {
      role: !locked && permissions.canAssignRole && rolesFor(member, roles).length > 1,
      remove: !locked && permissions.canRemove,
    };
  };

  let body;
  if (members.isPending) {
    body = <LoadingState label="Carregando usuários…" />;
  } else if (members.isError) {
    body = (
      <ErrorState
        description={describeLoadError(members.error)}
        onRetry={() => void members.refetch()}
      />
    );
  } else {
    body = (
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Tabela de usuários">
        <table className={styles.table}>
          <caption className="visually-hidden">Usuários</caption>
          <thead>
            <tr>
              <th scope="col">Pessoa</th>
              <th scope="col">Papel</th>
              <th scope="col">Enxerga</th>
              <th scope="col">
                <span className="visually-hidden">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.data.map((member) => {
              const actions = actionsFor(member);
              return (
                <tr key={member.id}>
                  <th scope="row">
                    <span className={styles.person}>{member.user.name}</span>
                    <span className={styles.personEmail}>{member.user.email}</span>
                  </th>
                  <td>{roleLabel(member.role.name)}</td>
                  <td>{seesLabel(member, clientName)}</td>
                  <td className={styles.rowActions}>
                    {actions.role && (
                      <Button
                        variant="secondary"
                        aria-label={`Trocar papel de ${member.user.name}`}
                        onClick={() => setOpen({ kind: 'role', member })}
                      >
                        Trocar papel
                      </Button>
                    )}
                    {actions.remove && (
                      <Button
                        variant="danger"
                        aria-label={`Remover ${member.user.name}`}
                        onClick={() => setOpen({ kind: 'remove', member })}
                      >
                        Remover
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="users-title">
      <div className={styles.panelHeader}>
        <h2 id="users-title" className={styles.panelTitle}>
          Usuários
        </h2>
        {permissions.canInviteWithRole && (
          <Button onClick={() => setOpen({ kind: 'invite' })}>Convidar</Button>
        )}
      </div>
      {body}
      {permissions.canInvite && (
        <PendingInvitations roles={roles} clientName={clientName} onDone={setNotice} />
      )}
      <p role="status" className={styles.notice}>
        {notice}
      </p>
      {open?.kind === 'invite' && (
        <InviteDialog roles={roles} onClose={() => setOpen(null)} onDone={done} />
      )}
      {open?.kind === 'role' && (
        <ChangeRoleDialog
          member={open.member}
          roles={roles}
          onClose={() => setOpen(null)}
          onDone={done}
        />
      )}
      {open?.kind === 'remove' && (
        <RemoveMemberDialog member={open.member} onClose={() => setOpen(null)} onDone={done} />
      )}
    </section>
  );
}
