import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './ui.module.css';

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className={styles.pageHeader}>
      <h1 className={styles.title}>{title}</h1>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </header>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <section className={styles.card}>{children}</section>;
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return (
    <button
      type="button"
      className={[styles.button, styles[variant], className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

export function LinkButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={styles.linkButton} {...props} />;
}

export { styles as uiStyles };
