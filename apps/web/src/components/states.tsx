import type { ReactNode } from 'react';
import { MissingConfigError } from '@/lib/env';
import { Button, Card, PageHeader, uiStyles as styles } from './ui';

// What a screen that could not reach the API tells the user.
export function describeLoadError(error: unknown): string {
  if (error instanceof MissingConfigError) {
    return `O painel está sem a configuração ${error.variable}. Fale com quem administra o painel.`;
  }
  return 'Não foi possível falar com o servidor. Confira sua conexão e tente de novo.';
}

export function LoadingState({
  label = 'Carregando…',
  fullscreen = false,
}: {
  label?: string;
  fullscreen?: boolean;
}) {
  return (
    <div
      className={[styles.state, fullscreen && styles.fullscreen].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className={styles.spinner} aria-hidden="true" />
      <p className={styles.stateText}>{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.state}>
      <h2 className={styles.stateTitle}>{title}</h2>
      {description && <p className={styles.stateText}>{description}</p>}
      {action && <div className={styles.stateAction}>{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Algo deu errado',
  description = 'Não foi possível carregar esta tela. Confira sua conexão e tente de novo.',
  onRetry,
  fullscreen = false,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  fullscreen?: boolean;
}) {
  return (
    <div
      className={[styles.state, fullscreen && styles.fullscreen].filter(Boolean).join(' ')}
      role="alert"
    >
      <span className={styles.errorIcon} aria-hidden="true">
        !
      </span>
      <h2 className={styles.stateTitle}>{title}</h2>
      <p className={styles.stateText}>{description}</p>
      {onRetry && (
        <div className={styles.stateAction}>
          <Button onClick={onRetry}>Tentar de novo</Button>
        </div>
      )}
    </div>
  );
}

export function ComingSoon({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <Card>
        <EmptyState
          title="Em breve"
          description="Esta página ainda está em construção e chega numa próxima etapa."
        />
      </Card>
    </>
  );
}

export function NoAccess() {
  return (
    <Card>
      <EmptyState
        title="Sem acesso a esta página"
        description="O seu papel não inclui esta página. Use o menu para ver o que está disponível."
      />
    </Card>
  );
}
