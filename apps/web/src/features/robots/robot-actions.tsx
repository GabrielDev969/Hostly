'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { Dialog } from '@/components/dialog';
import { Button } from '@/components/ui';
import { useClientFilter } from '@/features/shell/use-client-filter';
import { unwrap } from '@/lib/api/client';
import { usePanelSession } from '@/lib/session/session-provider';
import { describeActionError, isStaleError } from './action-errors';
import { useRobotPermissions } from './hooks';
import { robotKeys, useSites, type Robot, type Site } from './queries';
import styles from './robots.module.css';

const NAME_MIN = 2;
const NAME_MAX = 120;

// After an action: the detail takes the robot the API returned, and the lists reload (moving can change the client).
function useRobotMutation<T>(
  robotId: string,
  call: (input: T) => Promise<Robot>,
  done: (robot: Robot) => void,
) {
  const { workspace } = usePanelSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: call,
    onSuccess: (robot) => {
      queryClient.setQueryData(robotKeys.detail(workspace.id, robotId), robot);
      void queryClient.invalidateQueries({ queryKey: robotKeys.lists(workspace.id) });
      done(robot);
    },
    onError: (error) => {
      if (isStaleError(error))
        void queryClient.invalidateQueries({ queryKey: robotKeys.all(workspace.id) });
    },
  });
}

function RenameForm({ robot, onDone }: { robot: Robot; onDone: (message: string) => void }) {
  const { workspace, api } = usePanelSession();
  const [name, setName] = useState(robot.name);
  const inputId = useId();
  const errorId = useId();
  const rename = useRobotMutation(
    robot.id,
    (next: string) =>
      unwrap(
        api().PATCH('/api/v1/robots/{id}', {
          params: { path: { id: robot.id }, header: { 'x-workspace-id': workspace.id } },
          body: { name: next },
        }),
      ),
    () => onDone('Nome salvo.'),
  );
  const trimmed = name.trim();
  const invalid = trimmed.length < NAME_MIN || trimmed.length > NAME_MAX;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (invalid || trimmed === robot.name) return;
    rename.mutate(trimmed);
  };

  return (
    <form className={styles.actionForm} onSubmit={submit} noValidate>
      <div className={styles.field}>
        <label htmlFor={inputId} className={styles.label}>
          Nome
        </label>
        <input
          id={inputId}
          className={styles.input}
          value={name}
          maxLength={NAME_MAX}
          required
          aria-invalid={rename.isError || undefined}
          aria-describedby={rename.isError ? errorId : undefined}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={rename.isPending || invalid || trimmed === robot.name}>
        {rename.isPending ? 'Salvando…' : 'Salvar'}
      </Button>
      {rename.isError && (
        <p id={errorId} role="alert" className={styles.actionError}>
          {describeActionError(rename.error)}
        </p>
      )}
    </form>
  );
}

function MoveForm({ robot, onDone }: { robot: Robot; onDone: (message: string) => void }) {
  const { workspace, api } = usePanelSession();
  const { clients } = useClientFilter();
  const { sites, isPending, isError, fetchStatus } = useSites();
  const [siteId, setSiteId] = useState(robot.siteId);
  const selectId = useId();
  const errorId = useId();
  const move = useRobotMutation(
    robot.id,
    (next: string) =>
      unwrap(
        api().POST('/api/v1/robots/{id}/move', {
          params: { path: { id: robot.id }, header: { 'x-workspace-id': workspace.id } },
          body: { siteId: next },
        }),
      ),
    () => onDone('Local trocado.'),
  );

  // Sites grouped by client, by name; a client the list does not name still shows its sites.
  const groups = new Map<string, Site[]>();
  for (const site of sites) groups.set(site.clientId, [...(groups.get(site.clientId) ?? []), site]);
  const clientName = (id: string) =>
    clients.find((client) => client.id === id)?.name ?? 'Outro cliente';
  const loading = isPending && fetchStatus !== 'idle';

  if (!loading && (isError || sites.length === 0)) {
    return <p className={styles.muted}>A lista de locais não está disponível.</p>;
  }

  return (
    <form
      className={styles.actionForm}
      onSubmit={(event) => {
        event.preventDefault();
        if (siteId !== robot.siteId) move.mutate(siteId);
      }}
    >
      <div className={styles.field}>
        <label htmlFor={selectId} className={styles.label}>
          Local
        </label>
        <select
          id={selectId}
          className={styles.input}
          value={siteId}
          disabled={loading}
          aria-invalid={move.isError || undefined}
          aria-describedby={move.isError ? errorId : undefined}
          onChange={(event) => setSiteId(event.target.value)}
        >
          {[...groups.entries()]
            .sort(([a], [b]) => clientName(a).localeCompare(clientName(b), 'pt-BR'))
            .map(([clientId, group]) => (
              <optgroup key={clientId} label={clientName(clientId)}>
                {group.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </optgroup>
            ))}
        </select>
      </div>
      <Button type="submit" disabled={move.isPending || siteId === robot.siteId}>
        {move.isPending ? 'Trocando…' : 'Trocar local'}
      </Button>
      {move.isError && (
        <p id={errorId} role="alert" className={styles.actionError}>
          {describeActionError(move.error)}
        </p>
      )}
    </form>
  );
}

function RevokeButton({ robot, onDone }: { robot: Robot; onDone: (message: string) => void }) {
  const { workspace, api } = usePanelSession();
  const [open, setOpen] = useState(false);
  const revoke = useRobotMutation(
    robot.id,
    () =>
      unwrap(
        api().POST('/api/v1/robots/{id}/revoke', {
          params: { path: { id: robot.id }, header: { 'x-workspace-id': workspace.id } },
        }),
      ),
    () => {
      setOpen(false);
      onDone('Robô revogado.');
    },
  );
  const close = () => {
    if (revoke.isPending) return;
    setOpen(false);
    revoke.reset();
  };

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Revogar
      </Button>
      {open && (
        <Dialog
          title={`Revogar ${robot.name}?`}
          description={
            <>
              <p>O robô para de falar com a nuvem e precisa ser pareado de novo.</p>
              {revoke.isError && (
                <p role="alert" className={styles.actionError}>
                  {describeActionError(revoke.error)}
                </p>
              )}
            </>
          }
          onClose={close}
        >
          <Button variant="secondary" onClick={close} disabled={revoke.isPending}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={() => revoke.mutate(undefined)}
            disabled={revoke.isPending}
          >
            {revoke.isPending ? 'Revogando…' : 'Revogar'}
          </Button>
        </Dialog>
      )}
    </>
  );
}

// Each action shows only with its permission; a client user holds none of them.
export function RobotActions({ robot }: { robot: Robot }) {
  const { canRename, canMove, canRevoke } = useRobotPermissions();
  const [notice, setNotice] = useState('');
  const showRevoke = canRevoke && robot.status !== 'revoked';
  if (!canRename && !canMove && !showRevoke) return null;

  return (
    <section className={styles.panel} aria-labelledby="robot-actions-title">
      <h2 id="robot-actions-title" className={styles.panelTitle}>
        Ações
      </h2>
      <div className={styles.actions}>
        {canRename && <RenameForm key={robot.name} robot={robot} onDone={setNotice} />}
        {canMove && <MoveForm key={robot.siteId} robot={robot} onDone={setNotice} />}
        {showRevoke && (
          <div>
            <RevokeButton robot={robot} onDone={setNotice} />
          </div>
        )}
      </div>
      <p role="status" className={styles.actionNotice}>
        {notice}
      </p>
    </section>
  );
}
