'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { EmptyState, LoadingState } from '@/components/states';
import { Card } from '@/components/ui';
import { buildMenu } from '@/features/shell/menu';
import { usePanelSession } from '@/lib/session/session-provider';

// The panel home is the first page of the user's menu.
export default function PanelHome() {
  const { membership } = usePanelSession();
  const router = useRouter();
  const first = useMemo(
    () =>
      buildMenu({ scopeKind: membership.scope.kind, permissions: membership.permissions })[0]
        ?.items[0]?.href,
    [membership],
  );

  useEffect(() => {
    if (first) router.replace(first);
  }, [first, router]);

  if (first) return <LoadingState />;
  return (
    <Card>
      <EmptyState
        title="Nenhuma página disponível"
        description="O seu papel ainda não dá acesso a nenhuma página do painel. Fale com quem administra o painel."
      />
    </Card>
  );
}
