import styles from './settings.module.css';

// Brand and playlist do not exist yet, so this block shows what is coming and holds no value of its own.
const DEFAULTS: readonly (readonly [string, string])[] = [
  ['Marca padrão', 'Em breve: chega com o cadastro de marcas.'],
  ['Playlist padrão', 'Em breve: chega com as playlists.'],
  ['Selo “operado por”', 'Em breve: vai nascer ligado.'],
];

export function OperatorDefaults() {
  return (
    <section className={styles.panel} aria-labelledby="operator-defaults-title">
      <h2 id="operator-defaults-title" className={styles.panelTitle}>
        Padrões da operadora
      </h2>
      <dl className={styles.fields}>
        {DEFAULTS.map(([label, value]) => (
          <div key={label} className={styles.fieldRow}>
            <dt>{label}</dt>
            <dd className={styles.soon}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
