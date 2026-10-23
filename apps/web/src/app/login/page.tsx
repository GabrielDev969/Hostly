'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { describeLoadError, ErrorState, LoadingState } from '@/components/states';
import { LoginForm } from '@/features/auth/login-form';
import { safeNextPath } from '@/features/auth/safe-next';
import loginStyles from '@/features/auth/login.module.css';
import { useSession } from '@/lib/session/session-provider';

function LoginScreen() {
  const { state, retry } = useSession();
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get('next'));

  useEffect(() => {
    if (state.status === 'authenticated') router.replace(next);
  }, [state.status, next, router]);

  if (state.status === 'loading' || state.status === 'authenticated') {
    return <LoadingState fullscreen />;
  }
  if (state.status === 'error') {
    return (
      <ErrorState
        fullscreen
        description={describeLoadError(state.error)}
        onRetry={() => void retry()}
      />
    );
  }
  return (
    <main className={loginStyles.page}>
      <LoginForm
        notice={state.reason === 'expired' ? 'Sua sessão expirou. Entre de novo.' : undefined}
      />
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingState fullscreen />}>
      <LoginScreen />
    </Suspense>
  );
}
