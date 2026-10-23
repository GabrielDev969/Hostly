'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { describeLoadError, EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui';
import { useSession } from '@/lib/session/session-provider';

// Renders children only for a signed-in user with a workspace and membership loaded. It hides the
// panel from anonymous users; the API is what actually refuses them.
export function AuthGate({
  children,
  requireWorkspace = true,
}: {
  children: ReactNode;
  requireWorkspace?: boolean;
}) {
  const { state, retry, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const here = search ? `${pathname}?${search}` : pathname;

  const mustChooseWorkspace =
    requireWorkspace &&
    state.status === 'authenticated' &&
    !state.workspace &&
    state.user.workspaces.length > 1;

  useEffect(() => {
    if (state.status === 'anonymous') {
      router.replace(
        state.reason === 'signed-out' ? '/login' : `/login?next=${encodeURIComponent(here)}`,
      );
    } else if (mustChooseWorkspace) {
      router.replace(`/workspaces?next=${encodeURIComponent(here)}`);
    }
  }, [state, mustChooseWorkspace, here, router]);

  if (state.status === 'error') {
    return (
      <ErrorState
        fullscreen
        description={describeLoadError(state.error)}
        onRetry={() => void retry()}
      />
    );
  }
  if (state.status !== 'authenticated' || mustChooseWorkspace) return <LoadingState fullscreen />;
  if (state.user.workspaces.length === 0) {
    return (
      <EmptyState
        title="Sem acesso a nenhuma operadora"
        description="Sua conta ainda não foi adicionada a uma operadora. Fale com quem administra o painel."
        action={
          <Button variant="secondary" onClick={() => void logout()}>
            Sair
          </Button>
        }
      />
    );
  }
  if (requireWorkspace && !state.membership) return <LoadingState fullscreen />;
  return children;
}
