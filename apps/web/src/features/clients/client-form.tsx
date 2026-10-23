'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { Dialog } from '@/components/dialog';
import { Button } from '@/components/ui';
import type { Client } from '@/features/shell/use-client-filter';
import { unwrap } from '@/lib/api/client';
import { usePanelSession } from '@/lib/session/session-provider';
import { describeFormError, isNotFound } from './errors';
import { CLIENT_STATUS_LABELS, CLIENT_STATUSES } from './labels';
import { clientsKey } from './queries';
import styles from './clients.module.css';

// The API's limits (CreateClientDto), checked before sending so the field says what is wrong.
const NAME_MIN = 2;
const NAME_MAX = 120;

export function nameIsValid(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= NAME_MIN && trimmed.length <= NAME_MAX;
}

export const NAME_ERROR = `O nome tem de ${NAME_MIN} a ${NAME_MAX} caracteres.`;

// Creates a client, or edits one. The internal client is always active, so its status is not offered.
export function ClientFormDialog({
  client,
  onClose,
  onDone,
}: {
  client?: Client;
  onClose: () => void;
  onDone: (saved: Client, message: string) => void;
}) {
  const { workspace, api } = usePanelSession();
  const queryClient = useQueryClient();
  const [name, setName] = useState(client?.name ?? '');
  const [status, setStatus] = useState<Client['status']>(client?.status ?? 'onboarding');
  const [invalid, setInvalid] = useState(false);
  const ids = { form: useId(), name: useId(), nameError: useId(), status: useId() };
  const showStatus = !client?.isInternal;

  // Only what changed goes in an edit; a create sends both, status defaulting like the API.
  const changes = client
    ? {
        ...(name.trim() !== client.name ? { name: name.trim() } : {}),
        ...(showStatus && status !== client.status ? { status } : {}),
      }
    : { name: name.trim(), status };
  const unchanged = client !== undefined && Object.keys(changes).length === 0;

  const save = useMutation({
    mutationFn: () =>
      client
        ? unwrap(
            api().PATCH('/api/v1/clients/{id}', {
              params: { path: { id: client.id }, header: { 'x-workspace-id': workspace.id } },
              body: changes,
            }),
          )
        : unwrap(
            api().POST('/api/v1/clients', {
              params: { header: { 'x-workspace-id': workspace.id } },
              body: { name: name.trim(), status },
            }),
          ),
    onSuccess: (saved) => {
      // In the cache right away, so the page that opens the new client finds it before the reload lands.
      queryClient.setQueryData<Client[]>(clientsKey(workspace.id), (clients) =>
        clients?.some((c) => c.id === saved.id)
          ? clients.map((c) => (c.id === saved.id ? saved : c))
          : clients && [...clients, saved],
      );
      void queryClient.invalidateQueries({ queryKey: clientsKey(workspace.id) });
      onDone(saved, client ? `Cliente ${saved.name} salvo.` : `Cliente ${saved.name} criado.`);
    },
    onError: (error) => {
      if (isNotFound(error))
        void queryClient.invalidateQueries({ queryKey: clientsKey(workspace.id) });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!nameIsValid(name)) {
      setInvalid(true);
      return;
    }
    save.mutate();
  };
  const close = () => {
    if (!save.isPending) onClose();
  };
  const nameInvalid = invalid && !nameIsValid(name);

  return (
    <Dialog
      title={client ? `Editar ${client.name}` : 'Novo cliente'}
      description={
        <form id={ids.form} className={styles.dialogForm} onSubmit={submit} noValidate>
          <div className={styles.field}>
            <label htmlFor={ids.name} className={styles.label}>
              Nome
            </label>
            <input
              id={ids.name}
              className={styles.input}
              value={name}
              maxLength={NAME_MAX}
              autoComplete="off"
              required
              aria-invalid={nameInvalid || undefined}
              aria-describedby={nameInvalid ? ids.nameError : undefined}
              onChange={(event) => setName(event.target.value)}
            />
            {nameInvalid && (
              <p id={ids.nameError} className={styles.fieldError}>
                {NAME_ERROR}
              </p>
            )}
          </div>
          {showStatus && (
            <div className={styles.field}>
              <label htmlFor={ids.status} className={styles.label}>
                Status
              </label>
              <select
                id={ids.status}
                className={styles.input}
                value={status}
                onChange={(event) => setStatus(event.target.value as Client['status'])}
              >
                {CLIENT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {CLIENT_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
          )}
          {save.isError && (
            <p role="alert" className={styles.error}>
              {describeFormError(save.error, 'client')}
            </p>
          )}
        </form>
      }
      onClose={close}
    >
      <Button variant="secondary" onClick={close} disabled={save.isPending}>
        Cancelar
      </Button>
      <Button type="submit" form={ids.form} disabled={save.isPending || unchanged}>
        {save.isPending ? 'Salvando…' : client ? 'Salvar' : 'Criar cliente'}
      </Button>
    </Dialog>
  );
}
