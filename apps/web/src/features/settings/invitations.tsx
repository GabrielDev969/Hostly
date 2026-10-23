'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { Dialog } from '@/components/dialog';
import { Button } from '@/components/ui';
import { EMPTY, formatDateTime } from '@/features/robots/format';
import { useNow } from '@/features/robots/hooks';
import { useClientFilter } from '@/features/shell/use-client-filter';
import { ApiError } from '@/lib/api/errors';
import { unwrap, unwrapEmpty } from '@/lib/api/client';
import { usePanelSession } from '@/lib/session/session-provider';
import { describeUserError, isStaleUserError } from './errors';
import { GRANTABLE_ROLES, roleLabel, roleScope, seesLabel } from './labels';
import { settingsKeys, useInvitations, type Invitation, type Role } from './queries';
import styles from './settings.module.css';

const EMAIL = /^[^\s@]+@[^\s@]+$/;

export function InviteDialog({
  roles,
  onClose,
  onDone,
}: {
  roles: Role[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { workspace, api } = usePanelSession();
  const queryClient = useQueryClient();
  // Clients only: the internal client holds the operator's own robots, which operator members already see.
  const clients = useClientFilter().clients.filter((client) => !client.isInternal);
  const options = [...GRANTABLE_ROLES.operator, ...GRANTABLE_ROLES.client].flatMap((name) =>
    roles.filter((role) => role.isSystem && role.name === name),
  );
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [clientId, setClientId] = useState('');
  const [invalid, setInvalid] = useState(false);
  const ids = { form: useId(), email: useId(), role: useId(), client: useId() };

  const role = options.find((option) => option.id === roleId);
  const needsClient = role ? roleScope(role.name) === 'client' : false;

  const invite = useMutation({
    // The 201 carries the acceptance token; it is dropped here, never kept in the cache, shown or logged.
    mutationFn: async (body: { email: string; roleId: string; clientId?: string }) => {
      await unwrap(
        api().POST('/api/v1/invitations', {
          params: { header: { 'x-workspace-id': workspace.id } },
          body,
        }),
      );
    },
    onSuccess: (_nothing, body) => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.invitations(workspace.id) });
      onDone(`Convite enviado para ${body.email}.`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404)
        void queryClient.invalidateQueries({ queryKey: ['clients', workspace.id] });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL.test(trimmed) || !role || (needsClient && !clientId)) {
      setInvalid(true);
      return;
    }
    invite.mutate({ email: trimmed, roleId, ...(needsClient ? { clientId } : {}) });
  };
  const close = () => {
    if (!invite.isPending) onClose();
  };
  const emailInvalid = invalid && !EMAIL.test(email.trim());

  return (
    <Dialog
      title="Convidar pessoa"
      description={
        <form id={ids.form} className={styles.dialogForm} onSubmit={submit} noValidate>
          <p>A pessoa recebe um e-mail com o link pra entrar. O convite vale 7 dias.</p>
          <div className={styles.field}>
            <label htmlFor={ids.email} className={styles.label}>
              E-mail
            </label>
            <input
              id={ids.email}
              type="email"
              className={styles.input}
              value={email}
              autoComplete="off"
              required
              aria-invalid={emailInvalid || undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
            {emailInvalid && <p className={styles.fieldError}>Digite um e-mail válido.</p>}
          </div>
          <div className={styles.field}>
            <label htmlFor={ids.role} className={styles.label}>
              Papel
            </label>
            <select
              id={ids.role}
              className={styles.input}
              value={roleId}
              required
              aria-invalid={(invalid && !role) || undefined}
              onChange={(event) => setRoleId(event.target.value)}
            >
              <option value="">Escolha o papel</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {roleLabel(option.name)}
                </option>
              ))}
            </select>
            {invalid && !role && <p className={styles.fieldError}>Escolha o papel.</p>}
          </div>
          {needsClient && (
            <div className={styles.field}>
              <label htmlFor={ids.client} className={styles.label}>
                Cliente
              </label>
              <select
                id={ids.client}
                className={styles.input}
                value={clientId}
                required
                aria-invalid={(invalid && !clientId) || undefined}
                onChange={(event) => setClientId(event.target.value)}
              >
                <option value="">Escolha o cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              {invalid && !clientId && <p className={styles.fieldError}>Escolha o cliente.</p>}
            </div>
          )}
          {invite.isError && (
            <p role="alert" className={styles.error}>
              {describeUserError(invite.error, 'invite')}
            </p>
          )}
        </form>
      }
      onClose={close}
    >
      <Button variant="secondary" onClick={close} disabled={invite.isPending}>
        Cancelar
      </Button>
      <Button type="submit" form={ids.form} disabled={invite.isPending}>
        {invite.isPending ? 'Enviando…' : 'Enviar convite'}
      </Button>
    </Dialog>
  );
}

function CancelInvitationDialog({
  invitation,
  onClose,
  onDone,
}: {
  invitation: Invitation;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { workspace, api } = usePanelSession();
  const queryClient = useQueryClient();
  const reload = () =>
    queryClient.invalidateQueries({ queryKey: settingsKeys.invitations(workspace.id) });
  const cancel = useMutation({
    mutationFn: () =>
      unwrapEmpty(
        api().DELETE('/api/v1/invitations/{id}', {
          params: { path: { id: invitation.id }, header: { 'x-workspace-id': workspace.id } },
        }),
      ),
    onSuccess: () => {
      void reload();
      onDone(`Convite para ${invitation.email} cancelado.`);
    },
    onError: (error) => {
      if (!isStaleUserError(error, 'cancel-invite')) return;
      void reload();
      // An invitation accepted in the meantime is a new member now.
      void queryClient.invalidateQueries({ queryKey: settingsKeys.members(workspace.id) });
    },
  });
  const close = () => {
    if (!cancel.isPending) onClose();
  };

  return (
    <Dialog
      title={`Cancelar o convite de ${invitation.email}?`}
      description={
        <>
          <p>O link do e-mail deixa de valer.</p>
          {cancel.isError && (
            <p role="alert" className={styles.error}>
              {describeUserError(cancel.error, 'cancel-invite')}
            </p>
          )}
        </>
      }
      onClose={close}
    >
      <Button variant="secondary" onClick={close} disabled={cancel.isPending}>
        Voltar
      </Button>
      <Button variant="danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
        {cancel.isPending ? 'Cancelando…' : 'Cancelar convite'}
      </Button>
    </Dialog>
  );
}

export function PendingInvitations({
  roles,
  clientName,
  onDone,
}: {
  roles: Role[];
  clientName: (id: string) => string | undefined;
  onDone: (message: string) => void;
}) {
  const invitations = useInvitations(true);
  // An invitation turns "Expirado" while the page is open.
  const now = useNow(60_000);
  const [cancelling, setCancelling] = useState<Invitation | null>(null);
  const roleName = (id: string) => roles.find((role) => role.id === id)?.name;

  let body;
  if (invitations.isPending) {
    body = <p className={styles.muted}>Carregando convites…</p>;
  } else if (invitations.isError) {
    body = <p className={styles.muted}>A lista de convites não está disponível.</p>;
  } else {
    // The API lists accepted invitations too; only the open ones are pending.
    const pending = invitations.data.filter((invitation) => invitation.acceptedAt === null);
    body =
      pending.length === 0 ? (
        <p className={styles.muted}>Nenhum convite pendente.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="visually-hidden">Convites pendentes</caption>
            <thead>
              <tr>
                <th scope="col">E-mail</th>
                <th scope="col">Papel</th>
                <th scope="col">Enxerga</th>
                <th scope="col">Expira</th>
                <th scope="col">
                  <span className="visually-hidden">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pending.map((invitation) => {
                const name = roleName(invitation.roleId);
                return (
                  <tr key={invitation.id}>
                    <th scope="row">{invitation.email}</th>
                    <td>{name ? roleLabel(name) : EMPTY}</td>
                    <td>{seesLabel(invitation, clientName)}</td>
                    <td>
                      {Date.parse(invitation.expiresAt) <= now
                        ? 'Expirado'
                        : formatDateTime(invitation.expiresAt)}
                    </td>
                    <td className={styles.rowActions}>
                      <Button
                        variant="secondary"
                        aria-label={`Cancelar o convite de ${invitation.email}`}
                        onClick={() => setCancelling(invitation)}
                      >
                        Cancelar convite
                      </Button>
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
    <div className={styles.subsection}>
      <h3 className={styles.subTitle}>Convites pendentes</h3>
      {body}
      {cancelling && (
        <CancelInvitationDialog
          invitation={cancelling}
          onClose={() => setCancelling(null)}
          onDone={(message) => {
            setCancelling(null);
            onDone(message);
          }}
        />
      )}
    </div>
  );
}
