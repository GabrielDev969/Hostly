'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { describeLoadError, ErrorState, LoadingState } from '@/components/states';
import { uiStyles } from '@/components/ui';
import { unwrapEmpty } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { useSession } from '@/lib/session/session-provider';
import { TOO_MANY_ATTEMPTS } from './form-error';
import { ResendVerification } from './resend-verification';
import styles from './login.module.css';
import { useUrlToken } from './url-token';

type Step = { kind: 'sending' } | { kind: 'done' } | { kind: 'failed'; error: unknown };

function LoginLink() {
  return (
    <Link href="/login" className={`${uiStyles.button} ${uiStyles.primary} ${styles.submit}`}>
      Ir para o login
    </Link>
  );
}

export function VerifyEmail() {
  const urlToken = useUrlToken();
  const { api } = useSession();
  const [step, setStep] = useState<Step>({ kind: 'sending' });
  // The token is spent on the first call: an effect that runs again (Fast Refresh) must not resend it.
  const sent = useRef(false);
  const token = urlToken.status === 'read' ? urlToken.token : null;

  const send = async (value: string) => {
    try {
      await unwrapEmpty(api().POST('/api/v1/auth/verify-email', { body: { token: value } }));
      setStep({ kind: 'done' });
    } catch (error) {
      setStep({ kind: 'failed', error });
    }
  };

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    void send(token);
    // send only reads stable values; the token is what starts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const body = (() => {
    if (urlToken.status === 'reading') return <LoadingState label="Confirmando o e-mail…" />;
    if (!token) {
      return (
        <div className={styles.panel}>
          <h1 className={styles.title}>Link inválido</h1>
          <p className={styles.subtitle}>
            Este link de confirmação está incompleto. Abra de novo o link do e-mail ou peça um link
            novo.
          </p>
          <ResendVerification />
          <LoginLink />
        </div>
      );
    }
    if (step.kind === 'sending') return <LoadingState label="Confirmando o e-mail…" />;
    if (step.kind === 'done') {
      return (
        <div className={styles.panel}>
          <h1 className={styles.title}>E-mail confirmado</h1>
          <p className={styles.subtitle} role="status">
            Agora você já pode entrar com sua conta. Se recebeu um convite, abra-o de novo pelo link
            do e-mail do convite.
          </p>
          <LoginLink />
        </div>
      );
    }
    const status = step.error instanceof ApiError ? step.error.status : null;
    if (status === 400) {
      return (
        <div className={styles.panel}>
          <h1 className={styles.title}>Link inválido ou expirado</h1>
          <p className={styles.subtitle} role="alert">
            Este link já foi usado ou venceu (ele vale 24 horas). Se você já confirmou o e-mail, é
            só entrar. Se não, peça um link novo.
          </p>
          <ResendVerification />
          <LoginLink />
        </div>
      );
    }
    return (
      <ErrorState
        description={status === 429 ? TOO_MANY_ATTEMPTS : describeLoadError(step.error)}
        onRetry={() => {
          setStep({ kind: 'sending' });
          void send(token);
        }}
      />
    );
  })();

  return <main className={styles.page}>{body}</main>;
}
