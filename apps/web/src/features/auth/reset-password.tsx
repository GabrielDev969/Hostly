'use client';

import Link from 'next/link';
import { useId, useState, type FormEvent } from 'react';
import { LoadingState } from '@/components/states';
import { Button, uiStyles } from '@/components/ui';
import { unwrapEmpty } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { useSession } from '@/lib/session/session-provider';
import { FormError, refusedRules, TOO_MANY_ATTEMPTS, type FormFailure } from './form-error';
import styles from './login.module.css';
import { useUrlToken } from './url-token';

const linkClass = `${uiStyles.button} ${uiStyles.primary} ${styles.submit}`;

function field(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}

// A 400 without details is the API refusing the link (used or older than 1 hour) or a repeated password.
function resetError(error: unknown): FormFailure & { newLink: boolean } {
  if (error instanceof ApiError) {
    const details = refusedRules(error);
    if (error.status === 400 && details.length > 0) {
      return { message: 'A API recusou a senha:', details, newLink: false };
    }
    if (error.status === 400) {
      return {
        message: `A API recusou o pedido: ${error.message}. Se o link venceu (ele vale 1 hora), peça outro.`,
        details: [],
        newLink: true,
      };
    }
    if (error.status === 429) return { message: TOO_MANY_ATTEMPTS, details: [], newLink: false };
  }
  return {
    message: 'Não foi possível salvar a senha agora. Tente de novo.',
    details: [],
    newLink: false,
  };
}

export function ResetPassword() {
  const urlToken = useUrlToken();
  const { api } = useSession();
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<ReturnType<typeof resetError> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const errorId = useId();
  const token = urlToken.status === 'read' ? urlToken.token : null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    const data = new FormData(event.currentTarget);
    const newPassword = field(data, 'password');
    // Only a typo check: the password rules are the API's.
    if (newPassword !== field(data, 'confirmation')) {
      setFailure({ message: 'As duas senhas não são iguais.', details: [], newLink: false });
      return;
    }
    setSubmitting(true);
    setFailure(null);
    try {
      await unwrapEmpty(
        api().POST('/api/v1/auth/reset-password', { body: { token, newPassword } }),
      );
      setDone(true);
    } catch (caught) {
      setFailure(resetError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  const body = (() => {
    if (urlToken.status === 'reading') return <LoadingState />;
    if (!token) {
      return (
        <div className={styles.panel}>
          <h1 className={styles.title}>Link inválido</h1>
          <p className={styles.subtitle}>
            Este link para redefinir a senha está incompleto. Abra de novo o link do e-mail ou peça
            outro.
          </p>
          <Link href="/login?forgot=1" className={linkClass}>
            Pedir outro link
          </Link>
        </div>
      );
    }
    if (done) {
      return (
        <div className={styles.panel}>
          <h1 className={styles.title}>Senha alterada</h1>
          <p className={styles.subtitle} role="status">
            Entre com a senha nova. Por segurança, as sessões abertas da sua conta foram encerradas.
          </p>
          <Link href="/login" className={linkClass}>
            Ir para o login
          </Link>
        </div>
      );
    }
    const describedBy = failure ? errorId : undefined;
    return (
      <div className={styles.panel}>
        <h1 className={styles.title}>Criar senha nova</h1>
        <p className={styles.subtitle}>Escolha a senha nova da sua conta.</p>
        <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="reset-password">
              Senha nova
            </label>
            <input
              id="reset-password"
              name="password"
              type="password"
              className={styles.input}
              autoComplete="new-password"
              required
              aria-describedby={describedBy}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="reset-confirmation">
              Confirme a senha nova
            </label>
            <input
              id="reset-confirmation"
              name="confirmation"
              type="password"
              className={styles.input}
              autoComplete="new-password"
              required
              aria-describedby={describedBy}
            />
          </div>
          {failure && <FormError id={errorId} failure={failure} />}
          {failure?.newLink && (
            <Link href="/login?forgot=1" className={`${uiStyles.button} ${uiStyles.secondary}`}>
              Pedir outro link
            </Link>
          )}
          <Button type="submit" className={styles.submit} disabled={submitting}>
            {submitting ? 'Salvando…' : 'Salvar senha nova'}
          </Button>
        </form>
      </div>
    );
  })();

  return <main className={styles.page}>{body}</main>;
}
