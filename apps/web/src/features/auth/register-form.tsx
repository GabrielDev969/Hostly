'use client';

import { useId, useState, type FormEvent } from 'react';
import { Button, LinkButton } from '@/components/ui';
import { unwrapEmpty } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { useSession } from '@/lib/session/session-provider';
import { FormError, refusedRules, TOO_MANY_ATTEMPTS, type FormFailure } from './form-error';
import styles from './login.module.css';

function field(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}

function registerError(error: unknown): FormFailure {
  if (error instanceof ApiError) {
    const details = refusedRules(error);
    if (error.status === 400 && details.length > 0) {
      return { message: 'A API recusou o cadastro:', details };
    }
    if (error.status === 400) return { message: 'Confira os dados e tente de novo.', details: [] };
    if (error.status === 429) return { message: TOO_MANY_ATTEMPTS, details: [] };
  }
  return { message: 'Não foi possível criar a conta agora. Tente de novo.', details: [] };
}

// Creates the account without signing in: the API asks for the e-mail to be confirmed first.
export function RegisterForm({
  onExistingAccount,
  onSignIn,
}: {
  onExistingAccount: () => void;
  onSignIn: () => void;
}) {
  const { api } = useSession();
  const [registered, setRegistered] = useState<string | null>(null);
  const [failure, setFailure] = useState<FormFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const errorId = useId();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSubmitting(true);
    setFailure(null);
    const email = field(data, 'email');
    try {
      await unwrapEmpty(
        api().POST('/api/v1/auth/register', {
          body: { name: field(data, 'name'), email, password: field(data, 'password') },
        }),
      );
      setRegistered(email);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) onExistingAccount();
      else setFailure(registerError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  if (registered) {
    return (
      <div className={styles.panel}>
        <h1 className={styles.title}>Confirme seu e-mail</h1>
        <p className={styles.subtitle} role="status">
          Conta criada. Enviamos um link de confirmação para {registered}. Confirme o e-mail e
          depois abra este convite de novo pelo link do e-mail do convite.
        </p>
      </div>
    );
  }

  const describedBy = failure ? errorId : undefined;
  return (
    <div className={styles.panel}>
      <h1 className={styles.title}>Criar conta</h1>
      <p className={styles.subtitle}>Use o e-mail que recebeu o convite.</p>
      <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="register-name">
            Nome
          </label>
          <input
            id="register-name"
            name="name"
            className={styles.input}
            autoComplete="name"
            required
            aria-describedby={describedBy}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="register-email">
            E-mail
          </label>
          <input
            id="register-email"
            name="email"
            type="email"
            className={styles.input}
            autoComplete="username"
            required
            aria-describedby={describedBy}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="register-password">
            Senha
          </label>
          <input
            id="register-password"
            name="password"
            type="password"
            className={styles.input}
            autoComplete="new-password"
            required
            aria-describedby={describedBy}
          />
        </div>
        {failure && <FormError id={errorId} failure={failure} />}
        <Button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? 'Criando…' : 'Criar conta'}
        </Button>
      </form>
      <p className={styles.footer}>
        Já tem conta? <LinkButton onClick={onSignIn}>Entrar</LinkButton>
      </p>
    </div>
  );
}
