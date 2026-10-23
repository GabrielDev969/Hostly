'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui';
import { formatTime } from '@/features/robots/format';
import { robotKeys, useSites } from '@/features/robots/queries';
import { useClientFilter } from '@/features/shell/use-client-filter';
import { unwrap } from '@/lib/api/client';
import { usePanelSession } from '@/lib/session/session-provider';
import { describePairingError, restartsPairing } from './errors';
import type { PairingLookup } from './queries';
import styles from './settings.module.css';

const CODE = /^\d{6}$/;
const CODE_HELP = 'O código tem 6 números. Confira na tela de cima do robô.';

interface Pending {
  lookup: PairingLookup;
  clientName: string;
  siteName: string;
}

// Two steps, like the API: the lookup shows the serial, and only the approval pairs. The code lives in this
// component's state and in request bodies only: never in the URL, a query key or a log.
export function PairRobot() {
  const { workspace, api } = usePanelSession();
  const queryClient = useQueryClient();
  const filter = useClientFilter();
  const { sites, isError: sitesError } = useSites();

  const [code, setCode] = useState('');
  // Until the user picks one, the client chosen in the shell (?client=) is the default; it is known only once the
  // client list loads.
  const [pickedClient, setPickedClient] = useState<string | null>(null);
  const clientId = pickedClient ?? filter.clientId ?? '';
  const [siteId, setSiteId] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState('');
  const [codeInvalid, setCodeInvalid] = useState(false);
  const [notice, setNotice] = useState('');

  const ids = { code: useId(), help: useId(), client: useId(), site: useId() };
  const codeRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLHeadingElement>(null);

  // Focus follows the step, so a keyboard or screen reader user lands on what changed.
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (pending) confirmRef.current?.focus();
    else if (wasConfirming.current) codeRef.current?.focus();
    wasConfirming.current = pending !== null;
  }, [pending]);

  const clientSites = sites.filter((site) => site.clientId === clientId);
  const clientName = filter.clients.find((client) => client.id === clientId)?.name ?? '';
  const siteName = clientSites.find((site) => site.id === siteId)?.name ?? '';

  const lookup = useMutation({
    mutationFn: ({ code: value }: { code: string; clientName: string; siteName: string }) =>
      unwrap(
        api().POST('/api/v1/robots/pairings/lookup', {
          params: { header: { 'x-workspace-id': workspace.id } },
          body: { code: value },
        }),
      ),
    onSuccess: (result, { clientName: client, siteName: site }) =>
      setPending({ lookup: result, clientName: client, siteName: site }),
    onError: (failure) => setError(describePairingError(failure, 'lookup')),
  });

  const approve = useMutation({
    mutationFn: ({ body }: { body: { code: string; siteId: string }; where: string }) =>
      unwrap(
        api().POST('/api/v1/robots/pairings/approve', {
          params: { header: { 'x-workspace-id': workspace.id } },
          body,
        }),
      ),
    onSuccess: (_robot, { where }) => {
      restart();
      setNotice(`Robô pareado com ${where}. A marca e a programação chegam nele em instantes.`);
      void queryClient.invalidateQueries({ queryKey: robotKeys.all(workspace.id) });
    },
    onError: (failure) => {
      setError(describePairingError(failure, 'approve'));
      if (restartsPairing(failure)) restart();
    },
  });

  function restart() {
    setPending(null);
    setCode('');
    setCodeInvalid(false);
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setNotice('');
    setError('');
    // A malformed code never reaches the API, so it never spends one of the attempts.
    if (!CODE.test(code)) {
      setCodeInvalid(true);
      codeRef.current?.focus();
      return;
    }
    setCodeInvalid(false);
    if (!siteId) return;
    lookup.mutate({ code, clientName, siteName });
  };

  const confirm = () => {
    if (!pending) return;
    setError('');
    approve.mutate({
      body: { code, siteId },
      where: `${pending.clientName} · ${pending.siteName}`,
    });
  };

  const back = () => {
    setError('');
    setPending(null);
  };

  const existing = pending?.lookup.robot;
  const existingSite = existing && sites.find((site) => site.id === existing.siteId)?.name;
  const existingClient =
    existing && filter.clients.find((client) => client.id === existing.clientId)?.name;
  const noSites = clientId !== '' && !sitesError && clientSites.length === 0;

  return (
    <section className={styles.panel} aria-labelledby="pair-robot-title">
      <h2 id="pair-robot-title" className={styles.panelTitle}>
        Parear robô
      </h2>
      {pending ? (
        <div className={styles.confirm}>
          <h3 ref={confirmRef} tabIndex={-1} className={styles.confirmTitle}>
            Confirme o robô
          </h3>
          <dl className={styles.fields}>
            <div className={styles.fieldRow}>
              <dt>Serial</dt>
              <dd className={styles.mono}>{pending.lookup.serial}</dd>
            </div>
            <div className={styles.fieldRow}>
              <dt>Vai trabalhar em</dt>
              <dd>
                {pending.clientName} · {pending.siteName}
              </dd>
            </div>
            <div className={styles.fieldRow}>
              <dt>O código vale até</dt>
              <dd>{formatTime(pending.lookup.expiresAt)}</dd>
            </div>
          </dl>
          {existing && (
            <p role="alert" className={styles.warning}>
              Este robô já está cadastrado como {existing.name}
              {existingClient && existingSite ? ` (${existingClient} · ${existingSite})` : ''}.
              Parear de novo troca o token dele e pode mudar o local.
            </p>
          )}
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <div className={styles.buttons}>
            <Button variant="secondary" onClick={back} disabled={approve.isPending}>
              Voltar
            </Button>
            <Button onClick={confirm} disabled={approve.isPending}>
              {approve.isPending ? 'Pareando…' : 'Confirmar pareamento'}
            </Button>
          </div>
        </div>
      ) : (
        <form className={styles.form} onSubmit={submit} noValidate>
          <p className={styles.muted}>
            Ligue o robô com o app instalado. O código de 6 números aparece na tela de cima. Digite
            aqui e escolha onde ele vai trabalhar.
          </p>
          <div className={styles.formRow}>
            <div className={styles.field}>
              <label htmlFor={ids.code} className={styles.label}>
                Código do robô
              </label>
              <input
                ref={codeRef}
                id={ids.code}
                className={`${styles.input} ${styles.mono}`}
                value={code}
                inputMode="numeric"
                autoComplete="off"
                required
                aria-invalid={codeInvalid || undefined}
                aria-describedby={ids.help}
                // Spaces and dashes from a pasted code are dropped; six digits at most.
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              <p id={ids.help} className={codeInvalid ? styles.fieldError : styles.help}>
                {CODE_HELP}
              </p>
            </div>
            <div className={styles.field}>
              <label htmlFor={ids.client} className={styles.label}>
                Cliente
              </label>
              <select
                id={ids.client}
                className={styles.input}
                value={clientId}
                required
                onChange={(event) => {
                  setPickedClient(event.target.value);
                  setSiteId('');
                }}
              >
                <option value="">Escolha o cliente</option>
                {filter.clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor={ids.site} className={styles.label}>
                Local
              </label>
              <select
                id={ids.site}
                className={styles.input}
                value={siteId}
                required
                disabled={clientId === '' || noSites}
                onChange={(event) => setSiteId(event.target.value)}
              >
                <option value="">Escolha o local</option>
                {clientSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
              {noSites && (
                <p className={styles.help}>Este cliente ainda não tem local cadastrado.</p>
              )}
              {sitesError && <p className={styles.help}>A lista de locais não está disponível.</p>}
            </div>
          </div>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <div className={styles.buttons}>
            <Button type="submit" disabled={lookup.isPending || !siteId}>
              {lookup.isPending ? 'Conferindo…' : 'Parear'}
            </Button>
          </div>
        </form>
      )}
      <p role="status" className={styles.notice}>
        {notice}
      </p>
    </section>
  );
}
