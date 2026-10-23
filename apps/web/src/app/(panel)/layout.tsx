'use client';

import { Suspense, type ReactNode } from 'react';
import { LoadingState } from '@/components/states';
import { AuthGate } from '@/features/session/auth-gate';
import { AppShell } from '@/features/shell/app-shell';

export default function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<LoadingState fullscreen />}>
      <AuthGate>
        <AppShell>{children}</AppShell>
      </AuthGate>
    </Suspense>
  );
}
