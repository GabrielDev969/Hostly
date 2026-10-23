'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { LoadingState } from '@/components/states';
import { Button, Card, PageHeader } from '@/components/ui';
import { safeNextPath } from '@/features/auth/safe-next';
import { AuthGate } from '@/features/session/auth-gate';
import { useSession } from '@/lib/session/session-provider';
import styles from './workspaces.module.css';

function WorkspaceChooser() {
  const { state, selectWorkspace } = useSession();
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get('next'));
  if (state.status !== 'authenticated') return null;

  return (
    <main className={styles.page}>
      <PageHeader title="Escolha a operadora" subtitle="Sua conta participa de mais de uma." />
      <Card>
        <ul className={styles.list}>
          {state.user.workspaces.map((workspace) => (
            <li key={workspace.id}>
              <Button
                variant="secondary"
                className={styles.option}
                onClick={() => void selectWorkspace(workspace.id).then(() => router.replace(next))}
              >
                {workspace.name}
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}

export default function WorkspacesPage() {
  return (
    <Suspense fallback={<LoadingState fullscreen />}>
      <AuthGate requireWorkspace={false}>
        <WorkspaceChooser />
      </AuthGate>
    </Suspense>
  );
}
