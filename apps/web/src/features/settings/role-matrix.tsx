import styles from './settings.module.css';

// What the product promises each kind of membership, as the prototype shows it. Fixed text, not the RBAC: the API
// decides what each role can actually do.
const ROWS: readonly (readonly [string, string, string, string])[] = [
  ['Ver robôs ao vivo', 'Todos', 'Os dele', 'Não'],
  ['Mandar comandos', 'Sim', 'Falar e trocar modo', 'Não'],
  ['Subir mídia e criar campanha', 'Sim', 'Sim', 'Só as dele, com aprovação'],
  ['Ver relatórios', 'Todos', 'Os dele', 'Das campanhas dele'],
  ['Clientes, marcas e pareamento', 'Sim', 'Não', 'Não'],
];

export function RoleMatrix() {
  return (
    <section className={styles.panel} aria-labelledby="role-matrix-title">
      <h2 id="role-matrix-title" className={styles.panelTitle}>
        O que cada papel pode
      </h2>
      <div
        className={styles.tableWrap}
        tabIndex={0}
        role="region"
        aria-label="Tabela do que cada papel pode"
      >
        <table className={styles.table}>
          <caption className="visually-hidden">O que cada papel pode</caption>
          <thead>
            <tr>
              <th scope="col">Ação</th>
              <th scope="col">Operadora</th>
              <th scope="col">Cliente</th>
              <th scope="col">Anunciante</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([action, ...cells]) => (
              <tr key={action}>
                <th scope="row">{action}</th>
                {cells.map((cell, index) => (
                  <td key={index}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
