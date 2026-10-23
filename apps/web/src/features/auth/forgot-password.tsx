'use client';

import { useId, useState, type FormEvent } from 'react';
import { Button, LinkButton } from '@/components/ui';
import { unwrapEmpty } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { useSession } from '@/lib/session/session-provider';
import { TOO_MANY_ATTEMPTS } from './form-error';
import styles from './login.module.css';

// The API answers 204 whether or not the e-mail has an account, and so does this screen.
export const FORGOT_PASSWORD_SENT =
  'Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha. Ele vale 1 hora.';

function forgotError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return 'Confira o e-mail.';
    if (error.status === 429) return TOO_MANY_ATTEMPTS;
  }
  return 'Não foi possível enviar agora. Tente de novo.';
}

export function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const { api } = useSession();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const errorId = useId();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get('email');
    setSubmitting(true);
    setError(null);
    try {
      await unwrapEmpty(
        api().POST('/api/v1/auth/forgot-password', {
          body: { email: typeof email === 'string' ? email : '' },
        }),
      );
      setSent(true);
    } catch (caught) {
      setError(forgotError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className={styles.panel}>
        <h1 className={styles.title}>Confira seu e-mail</h1>
        <p className={styles.subtitle} role="status">
          {FORGOT_PASSWORD_SENT}
        </p>
        <Button className={styles.submit} onClick={onBack}>
          Voltar para o login
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <h1 className={styles.title}>Esqueci a senha</h1>
      <p className={styles.subtitle}>
        Digite o e-mail da sua conta. Enviamos um link para criar uma senha nova.
      </p>
      <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="forgot-email">
            E-mail
          </label>
          <input
            id="forgot-email"
            name="email"
            type="email"
            className={styles.input}
            autoComplete="username"
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
        </div>
        {error && (
          <p className={styles.error} id={errorId} role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? 'Enviando…' : 'Enviar link'}
        </Button>
        <div className={styles.links}>
          <LinkButton onClick={onBack}>Voltar</LinkButton>
        </div>
      </form>
    </div>
  );
}
