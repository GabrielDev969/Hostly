'use client';

import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui';
import { unwrapEmpty } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { useSession } from '@/lib/session/session-provider';
import { TOO_MANY_ATTEMPTS } from './form-error';
import styles from './login.module.css';

// The API answers 204 whether the e-mail has an account, is waiting or is already confirmed, and so
// does this screen.
export const RESEND_VERIFICATION_SENT =
  'Se houver uma conta com esse e-mail esperando confirmação, enviamos um link novo. Ele vale 24 horas.';

function resendError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return 'Confira o e-mail.';
    if (error.status === 429) return TOO_MANY_ATTEMPTS;
  }
  return 'Não foi possível enviar agora. Tente de novo.';
}

// With an e-mail (the one the login refused) it is just the button; without, it asks for one.
export function ResendVerification({ email }: { email?: string }) {
  const { api } = useSession();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const errorId = useId();
  const inputId = useId();

  const send = async (value: string) => {
    setSubmitting(true);
    setError(null);
    try {
      await unwrapEmpty(api().POST('/api/v1/auth/verify-email/resend', { body: { email: value } }));
      setSent(true);
    } catch (caught) {
      setError(resendError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <p className={`${styles.notice} ${styles.resend}`} role="status">
        {RESEND_VERIFICATION_SENT}
      </p>
    );
  }

  const errorMessage = error && (
    <p className={styles.error} id={errorId} role="alert">
      {error}
    </p>
  );
  const button = (
    <Button
      type={email === undefined ? 'submit' : 'button'}
      variant="secondary"
      className={styles.submit}
      disabled={submitting}
      onClick={email === undefined ? undefined : () => void send(email)}
    >
      {submitting ? 'Enviando…' : 'Reenviar e-mail de verificação'}
    </Button>
  );

  if (email !== undefined) {
    return (
      <div className={`${styles.form} ${styles.resend}`}>
        {errorMessage}
        {button}
      </div>
    );
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('email');
    void send(typeof value === 'string' ? value : '');
  };

  return (
    <form className={`${styles.form} ${styles.resend}`} onSubmit={submit} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={inputId}>
          E-mail
        </label>
        <input
          id={inputId}
          name="email"
          type="email"
          className={styles.input}
          autoComplete="email"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </div>
      {errorMessage}
      {button}
    </form>
  );
}
