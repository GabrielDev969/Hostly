'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Dialog } from '@/components/dialog';
import { Button } from '@/components/ui';
import { unwrapEmpty } from '@/lib/api/client';
import { usePanelSession } from '@/lib/session/session-provider';
import { describeUserError, isStaleUserError, type UserAction } from './errors';
import { GRANTABLE_ROLES, roleLabel, scopeOf } from './labels';
import { settingsKeys, type Member, type Role } from './queries';
import styles from './settings.module.css';

// A members mutation: on success the list reloads; on a stale answer too, and the dialog shows why.
function useMemberMutation(action: UserAction, call: () => Promise<void>, done: () => void) {
  const { workspace } = usePanelSession();
  const queryClient = useQueryClient();
  const reload = () =>
    queryClient.invalidateQueries({ queryKey: settingsKeys.members(workspace.id) });
  const mutation = useMutation({
    mutationFn: call,
    onSuccess: () => {
      void reload();
      done();
    },
    onError: (error) => {
      if (isStaleUserError(error, action)) void reload();
    },
  });
  return mutation;
}

// The system roles that fit the member's scope; an advertiser has none to switch to yet.
export function rolesFor(member: Member, roles: Role[]): Role[] {
  const scope = scopeOf(member);
  if (scope === 'advertiser') return [];
  const names = GRANTABLE_ROLES[scope];
  return names.flatMap((name) => roles.filter((role) => role.isSystem && role.name === name));
}

export function ChangeRoleDialog({
  member,
  roles,
  onClose,
  onDone,
}: {
  member: Member;
  roles: Role[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { workspace, api } = usePanelSession();
  const options = rolesFor(member, roles);
  const [roleId, setRoleId] = useState(member.roleId);
  const selectId = useId();
  const change = useMemberMutation(
    'role',
    () =>
      unwrapEmpty(
        api().PATCH('/api/v1/workspaces/{workspaceId}/members/{memberId}', {
          params: { path: { workspaceId: workspace.id, memberId: member.id } },
          body: { roleId },
        }),
      ),
    () => onDone(`Papel de ${member.user.name} trocado.`),
  );
  const close = () => {
    if (!change.isPending) onClose();
  };

  return (
    <Dialog
      title={`Trocar papel de ${member.user.name}`}
      description={
        <>
          <p>O papel novo vale na hora, e a sessão atual da pessoa é encerrada.</p>
          <div className={styles.field}>
            <label htmlFor={selectId} className={styles.label}>
              Papel
            </label>
            <select
              id={selectId}
              className={styles.input}
              value={roleId}
              disabled={change.isPending}
              onChange={(event) => setRoleId(event.target.value)}
            >
              {options.map((role) => (
                <option key={role.id} value={role.id}>
                  {roleLabel(role.name)}
                </option>
              ))}
            </select>
          </div>
          {change.isError && (
            <p role="alert" className={styles.error}>
              {describeUserError(change.error, 'role')}
            </p>
          )}
        </>
      }
      onClose={close}
    >
      <Button variant="secondary" onClick={close} disabled={change.isPending}>
        Cancelar
      </Button>
      <Button
        onClick={() => change.mutate()}
        disabled={change.isPending || roleId === member.roleId}
      >
        {change.isPending ? 'Salvando…' : 'Salvar'}
      </Button>
    </Dialog>
  );
}

export function RemoveMemberDialog({
  member,
  onClose,
  onDone,
}: {
  member: Member;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { workspace, api } = usePanelSession();
  const remove = useMemberMutation(
    'remove',
    () =>
      unwrapEmpty(
        api().DELETE('/api/v1/workspaces/{workspaceId}/members/{memberId}', {
          params: { path: { workspaceId: workspace.id, memberId: member.id } },
        }),
      ),
    () => onDone(`${member.user.name} foi removido.`),
  );
  const close = () => {
    if (!remove.isPending) onClose();
  };

  return (
    <Dialog
      title={`Remover ${member.user.name}?`}
      description={
        <>
          <p>
            {member.user.email} perde o acesso a este painel. A conta continua existindo e pode ser
            convidada de novo.
          </p>
          {remove.isError && (
            <p role="alert" className={styles.error}>
              {describeUserError(remove.error, 'remove')}
            </p>
          )}
        </>
      }
      onClose={close}
    >
      <Button variant="secondary" onClick={close} disabled={remove.isPending}>
        Cancelar
      </Button>
      <Button variant="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
        {remove.isPending ? 'Removendo…' : 'Remover'}
      </Button>
    </Dialog>
  );
}
