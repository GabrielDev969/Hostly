'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { Dialog } from '@/components/dialog';
import { Button } from '@/components/ui';
import { robotKeys, type Site } from '@/features/robots/queries';
import { unwrap } from '@/lib/api/client';
import { usePanelSession } from '@/lib/session/session-provider';
import { NAME_ERROR, nameIsValid } from './client-form';
import { describeFormError, isNotFound } from './errors';
import { clientsKey } from './queries';
import { DEFAULT_TIME_ZONE, timeZoneGroups } from './timezones';
import styles from './clients.module.css';

const ADDRESS_MAX = 500;

// Creates a site in the client, or edits one (its client never changes). The time zone is only chosen from the
// list; whatever the API refuses shows as it said it.
export function SiteFormDialog({
  clientId,
  site,
  onClose,
  onDone,
}: {
  clientId: string;
  site?: Site;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { workspace, api } = usePanelSession();
  const queryClient = useQueryClient();
  const [name, setName] = useState(site?.name ?? '');
  const [timezone, setTimezone] = useState(site?.timezone ?? DEFAULT_TIME_ZONE);
  const [address, setAddress] = useState(site?.address ?? '');
  const [invalid, setInvalid] = useState(false);
  const groups = useMemo(() => timeZoneGroups(undefined, site?.timezone), [site?.timezone]);
  const ids = {
    form: useId(),
    name: useId(),
    nameError: useId(),
    timezone: useId(),
    timezoneHelp: useId(),
    address: useId(),
  };

  const trimmedAddress = address.trim();
  // An edit sends what changed; clearing the address sends null, which the API reads as "remove it".
  const changes = site
    ? {
        ...(name.trim() !== site.name ? { name: name.trim() } : {}),
        ...(timezone !== site.timezone ? { timezone } : {}),
        ...(trimmedAddress !== (site.address ?? '') ? { address: trimmedAddress || null } : {}),
      }
    : {};
  const unchanged = site !== undefined && Object.keys(changes).length === 0;

  const reloadSites = () =>
    queryClient.invalidateQueries({ queryKey: robotKeys.sites(workspace.id) });
  const save = useMutation({
    mutationFn: () =>
      site
        ? unwrap(
            api().PATCH('/api/v1/sites/{id}', {
              params: { path: { id: site.id }, header: { 'x-workspace-id': workspace.id } },
              body: changes,
            }),
          )
        : unwrap(
            api().POST('/api/v1/sites', {
              params: { header: { 'x-workspace-id': workspace.id } },
              body: {
                clientId,
                name: name.trim(),
                timezone,
                ...(trimmedAddress ? { address: trimmedAddress } : {}),
              },
            }),
          ),
    onSuccess: (saved) => {
      // The sites list also feeds the site choice of "Parear robô" in Settings.
      queryClient.setQueryData<Site[]>(robotKeys.sites(workspace.id), (sites) =>
        sites?.some((s) => s.id === saved.id)
          ? sites.map((s) => (s.id === saved.id ? saved : s))
          : sites && [...sites, saved],
      );
      void reloadSites();
      onDone(site ? `Local ${saved.name} salvo.` : `Local ${saved.name} criado.`);
    },
    onError: (error) => {
      if (!isNotFound(error)) return;
      void reloadSites();
      // Creating answers 404 when the client is gone.
      if (!site) void queryClient.invalidateQueries({ queryKey: clientsKey(workspace.id) });
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
      title={site ? `Editar ${site.name}` : 'Novo local'}
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
              maxLength={120}
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
          <div className={styles.field}>
            <label htmlFor={ids.timezone} className={styles.label}>
              Fuso horário
            </label>
            <select
              id={ids.timezone}
              className={styles.input}
              value={timezone}
              required
              aria-describedby={ids.timezoneHelp}
              onChange={(event) => setTimezone(event.target.value)}
            >
              {groups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.zones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p id={ids.timezoneHelp} className={styles.help}>
              A agenda dos robôs deste local segue este fuso.
            </p>
          </div>
          <div className={styles.field}>
            <label htmlFor={ids.address} className={styles.label}>
              Endereço (opcional)
            </label>
            <input
              id={ids.address}
              className={styles.input}
              value={address}
              maxLength={ADDRESS_MAX}
              autoComplete="off"
              onChange={(event) => setAddress(event.target.value)}
            />
          </div>
          {save.isError && (
            <p role="alert" className={styles.error}>
              {describeFormError(save.error, 'site')}
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
        {save.isPending ? 'Salvando…' : site ? 'Salvar' : 'Criar local'}
      </Button>
    </Dialog>
  );
}
