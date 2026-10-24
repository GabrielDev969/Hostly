'use client';

import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Button, LinkButton } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { useSession } from '@/lib/session/session-provider';
import { ForgotPasswordForm } from './forgot-password';
import { ResendVerification } from './resend-verification';
import styles from './login.module.css';

// The API answers both with 401; only an expired challenge sends the user back to the password.
const EXPIRED_CHALLENGE = 'Invalid or expired challenge';

type Step =
  | { kind: 'credentials'; notice?: string }
  | { kind: 'two-factor'; challenge: string; recovery: boolean }
  | { kind: 'forgot' };

function field(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}

function credentialsError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'E-mail ou senha inválidos.';
    if (error.status === 400) return 'Confira o e-mail e a senha.';
    // The only 403 of the login: the account exists but its e-mail was not confirmed yet.
    if (error.status === 403) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
    if (error.status === 423) {
      return 'Conta bloqueada por excesso de tentativas. Tente de novo em alguns minutos.';
    }
    if (error.status === 429) return 'Muitas tentativas. Aguarde um pouco e tente de novo.';
  }
  return 'Não foi possível entrar agora. Tente de novo.';
}

function codeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 400)
      return 'Código inválido. Confira e tente de novo.';
    if (error.status === 429) return 'Muitas tentativas. Aguarde um pouco e tente de novo.';
  }
  return 'Não foi possível verificar o código agora. Tente de novo.';
}

export function LoginForm({
  notice,
  footer,
  startAtForgot = false,
  onSignedIn,
}: {
  notice?: string;
  // Shown under the credentials form, e.g. the link to create an account on the invitation page.
  footer?: ReactNode;
  startAtForgot?: boolean;
  // Runs once the session holds the signed-in user.
  onSignedIn?: () => void;
}) {
  const { login, verifyTwoFactor } = useSession();
  const [step, setStep] = useState<Step>(
    startAtForgot ? { kind: 'forgot' } : { kind: 'credentials', notice },
  );
  const [error, setError] = useState<string | null>(null);
  // The e-mail the login refused as unconfirmed: the resend goes to it, never to a retyped one.
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const errorId = useId();

  const submitCredentials = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = field(data, 'email');
    setSubmitting(true);
    setError(null);
    setUnverifiedEmail(null);
    try {
      const result = await login(email, field(data, 'password'));
      if (result.kind === 'two-factor') {
        setStep({ kind: 'two-factor', challenge: result.challenge, recovery: false });
      } else {
        onSignedIn?.();
      }
    } catch (caught) {
      setError(credentialsError(caught));
      if (caught instanceof ApiError && caught.status === 403) setUnverifiedEmail(email);
    } finally {
      setSubmitting(false);
    }
  };

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step.kind !== 'two-factor') return;
    const code = field(new FormData(event.currentTarget), 'code').trim();
    setSubmitting(true);
    setError(null);
    try {
      await verifyTwoFactor(step.challenge, code);
      onSignedIn?.();
    } catch (caught) {
      if (caught instanceof ApiError && caught.message === EXPIRED_CHALLENGE) {
        setStep({
          kind: 'credentials',
          notice: 'O tempo para digitar o código acabou. Entre de novo.',
        });
      } else {
        setError(codeError(caught));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const errorMessage = error && (
    <p className={styles.error} id={errorId} role="alert">
      {error}
    </p>
  );

  if (step.kind === 'forgot') {
    return <ForgotPasswordForm onBack={() => setStep({ kind: 'credentials' })} />;
  }

  if (step.kind === 'credentials') {
    return (
      <div className={styles.panel}>
        <h1 className={styles.title}>Entrar no painel</h1>
        <p className={styles.subtitle}>Use o e-mail e a senha da sua conta.</p>
        {step.notice && (
          <p className={styles.notice} role="status">
            {step.notice}
          </p>
        )}
        <form
          className={styles.form}
          onSubmit={(event) => void submitCredentials(event)}
          noValidate
        >
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-email">
              E-mail
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              className={styles.input}
              autoComplete="username"
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-password">
              Senha
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              className={styles.input}
              autoComplete="current-password"
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </div>
          {errorMessage}
          <Button type="submit" className={styles.submit} disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </Button>
          <div className={styles.links}>
            <LinkButton
              onClick={() => {
                setError(null);
                setUnverifiedEmail(null);
                setStep({ kind: 'forgot' });
              }}
            >
              Esqueci a senha
            </LinkButton>
          </div>
        </form>
        {unverifiedEmail && <ResendVerification email={unverifiedEmail} />}
        {footer}
      </div>
    );
  }

  const recovery = step.recovery;
  return (
    <div className={styles.panel}>
      <h1 className={styles.title}>Verificação em duas etapas</h1>
      <p className={styles.subtitle}>
        {recovery
          ? 'Digite um dos seus códigos de recuperação. Cada código vale uma vez só.'
          : 'Digite o código de 6 dígitos do seu app autenticador.'}
      </p>
      <form
        key={recovery ? 'recovery' : 'totp'}
        className={styles.form}
        onSubmit={(event) => void submitCode(event)}
        noValidate
      >
        <div className={styles.field}>
          <label className={styles.label} htmlFor="login-code">
            {recovery ? 'Código de recuperação' : 'Código do app autenticador'}
          </label>
          <input
            id="login-code"
            name="code"
            className={`${styles.input} ${styles.code}`}
            autoComplete="one-time-code"
            inputMode={recovery ? 'text' : 'numeric'}
            pattern={recovery ? undefined : '[0-9]{6}'}
            maxLength={recovery ? 11 : 6}
            placeholder={recovery ? 'XXXXX-XXXXX' : '000000'}
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
        </div>
        {errorMessage}
        <Button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? 'Verificando…' : 'Verificar'}
        </Button>
        <div className={styles.links}>
          <LinkButton
            onClick={() => {
              setError(null);
              setStep({ ...step, recovery: !recovery });
            }}
          >
            {recovery ? 'Usar o app autenticador' : 'Usar código de recuperação'}
          </LinkButton>
          <LinkButton
            onClick={() => {
              setError(null);
              setStep({ kind: 'credentials' });
            }}
          >
            Voltar
          </LinkButton>
        </div>
      </form>
    </div>
  );
}
