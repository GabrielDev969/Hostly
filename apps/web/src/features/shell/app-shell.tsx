'use client';

import { usePathname } from 'next/navigation';
import { useMemo, type ReactNode } from 'react';
import { NoAccess } from '@/components/states';
import { usePanelSession } from '@/lib/session/session-provider';
import { buildMenu, findMenuItem, isInMenu } from './menu';
import styles from './shell.module.css';
import { Sidebar } from './sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  const { membership } = usePanelSession();
  const pathname = usePathname();
  const menu = useMemo(
    () => buildMenu({ scopeKind: membership.scope.kind, permissions: membership.permissions }),
    [membership],
  );
  const item = findMenuItem(pathname);
  const allowed = !item || isInMenu(menu, item.key);

  return (
    <div className={styles.shell}>
      <a href="#main-content" className={styles.skipLink}>
        Pular para o conteúdo
      </a>
      <Sidebar menu={menu} />
      <main id="main-content" tabIndex={-1} className={styles.main}>
        <div className={styles.content}>{allowed ? children : <NoAccess />}</div>
      </main>
    </div>
  );
}
