'use client';

import styles from './shell.module.css';
import { useClientFilter } from './use-client-filter';

export function ClientSelector() {
  const { visible, fixed, clients, clientId, setClientId, isLoading, isError } = useClientFilter();
  if (!visible) return null;

  if (fixed) {
    const own = clients.find((client) => client.id === clientId);
    return (
      <div className={styles.selector}>
        <span className={styles.selectorLabel}>Cliente</span>
        <span className={styles.fixedClient}>
          {own?.name ?? (isLoading ? 'Carregando…' : 'Indisponível')}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.selector}>
      <label className={styles.selectorLabel} htmlFor="client-selector">
        Cliente
      </label>
      <select
        id="client-selector"
        className={styles.select}
        value={clientId ?? ''}
        disabled={isLoading || isError}
        onChange={(event) => setClientId(event.target.value || null)}
      >
        <option value="">Todos os clientes</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </select>
    </div>
  );
}
