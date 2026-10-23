'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { z } from 'zod';
import { describeLoadError, ErrorState, LoadingState } from '@/components/states';
import { Button, LinkButton } from '@/components/ui';
import { unwrapUntyped } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { useSession } from '@/lib/session/session-provider';
import { TOO_MANY_ATTEMPTS } from './form-error';
import { LoginForm } from './login-form';
import styles from './login.module.css';
import { RegisterForm } from './register-form';
import { useUrlToken } from './url-token';

// The API answers { workspaceId, roleId }, which its OpenAPI document leaves out.
const accepted = z.object({ workspaceId: z.uuid() });

type Outcome = { kind: 'idle' } | { kind: 'accepting' } | { kind: 'failed'; error: unknown };
type Anonymous = { form: 'login'; notice?: string } | { form: 'register' };

function Message({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={styles.panel}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.subtitle}>{children}</p>
      {actions && <div className={styles.form}>{actions}</div>}
    </div>
  );
}

export function AcceptInvitation() {
  const urlToken = useUrlToken();
  const { state, api, logout, reloadProfile, retry } = useSession();
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [anonymous, setAnonymous] = useState<Anonymous>({ form: 'login' });
  const token = urlToken.status === 'read' ? urlToken.token : null;

  const accept = async () => {
    if (!token) return;
    setOutcome({ kind: 'accepting' });
    try {
      const body = await unwrapUntyped(
        api().POST('/api/v1/invitations/accept', { body: { token } }),
      );
      const parsed = accepted.safeParse(body);
      await reloadProfile(parsed.success ? parsed.data.workspaceId : undefined);
      router.replace('/');
    } catch (error) {
      // A dead session goes back to the sign-in form; the token is still here.
      if (error instanceof ApiError && error.status === 401) setOutcome({ kind: 'idle' });
      else setOutcome({ kind: 'failed', error });
    }
  };

  const switchAccount = async () => {
    setOutcome({ kind: 'idle' });
    setAnonymous({ form: 'login' });
    await logout();
  };

  const goToPanel = (
    <Button className={styles.submit} onClick={() => router.replace('/')}>
      Ir para o painel
    </Button>
  );

  const body = (() => {
    if (urlToken.status === 'reading') return <LoadingState />;
    if (!token) {
      return (
        <Message title="Link de convite inválido">
          Este link está incompleto. Abra de novo o link do e-mail do convite.
        </Message>
      );
    }
    if (outcome.kind === 'accepting') return <LoadingState label="Aceitando o convite…" />;
    if (outcome.kind === 'failed') {
      const status = outcome.error instanceof ApiError ? outcome.error.status : null;
      switch (status) {
        case 403:
          return (
            <Message
              title="Convite para outro e-mail"
              actions={
                <Button className={styles.submit} onClick={() => void switchAccount()}>
                  Sair e entrar com outra conta
                </Button>
              }
            >
              Este convite foi enviado para outro e-mail. Entre com a conta desse e-mail para
              aceitar.
            </Message>
          );
        case 404:
          return (
            <Message title="Convite não encontrado">
              Este convite não existe. Peça um novo a quem convidou você.
            </Message>
          );
        case 400:
          return (
            <Message title="Convite expirado ou já usado">
              Este convite venceu ou já foi aceito. Peça um novo a quem convidou você.
            </Message>
          );
        case 409:
          return (
            <Message title="Não foi possível aceitar" actions={goToPanel}>
              Você já faz parte desta operadora, ou o papel ou o cliente do convite não existe mais.
              Se precisar, peça um novo convite a quem convidou você.
            </Message>
          );
        default:
          return (
            <ErrorState
              description={status === 429 ? TOO_MANY_ATTEMPTS : describeLoadError(outcome.error)}
              onRetry={() => void accept()}
            />
          );
      }
    }
    if (state.status === 'loading') return <LoadingState />;
    if (state.status === 'error') {
      return (
        <ErrorState description={describeLoadError(state.error)} onRetry={() => void retry()} />
      );
    }
    if (state.status === 'anonymous') {
      if (anonymous.form === 'register') {
        return (
          <RegisterForm
            onExistingAccount={() =>
              setAnonymous({ form: 'login', notice: 'Este e-mail já tem conta. Entre com ela.' })
            }
            onSignIn={() => setAnonymous({ form: 'login' })}
          />
        );
      }
      return (
        <LoginForm
          key={anonymous.notice ?? 'login'}
          notice={
            anonymous.notice ?? 'Entre com a conta do e-mail convidado para aceitar o convite.'
          }
          onSignedIn={() => void accept()}
          footer={
            <p className={styles.footer}>
              Ainda não tem conta?{' '}
              <LinkButton onClick={() => setAnonymous({ form: 'register' })}>
                Criar conta
              </LinkButton>
            </p>
          }
        />
      );
    }
    return (
      <Message
        title="Aceitar convite"
        actions={
          <>
            <Button className={styles.submit} onClick={() => void accept()}>
              Aceitar convite
            </Button>
            <LinkButton onClick={() => void switchAccount()}>Entrar com outra conta</LinkButton>
          </>
        }
      >
        Você vai entrar na operadora do convite como {state.user.email}.
      </Message>
    );
  })();

  return <main className={styles.page}>{body}</main>;
}
