'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Ref } from 'react';
import { usePanelSession } from '@/lib/session/session-provider';
import { ClientSelector } from './client-selector';
import type { MenuGroup } from './menu';
import styles from './shell.module.css';
import { CLIENT_PARAM, useClientFilter } from './use-client-filter';

export function Sidebar({
  ref,
  id,
  menu,
  open,
  onClose,
}: {
  ref: Ref<HTMLElement>;
  id: string;
  menu: readonly MenuGroup[];
  // Only on a phone, where the menu is a panel over the content; on a desktop it is always there.
  open: boolean;
  onClose: () => void;
}) {
  const { user, workspace, membership, logout } = usePanelSession();
  const { clientId } = useClientFilter();
  const pathname = usePathname();
  // Only the operator picks a client; keep the choice while moving between pages.
  const withClient = (href: string) =>
    membership.scope.kind === 'operator' && clientId ? `${href}?${CLIENT_PARAM}=${clientId}` : href;

  return (
    <aside ref={ref} id={id} className={styles.sidebar} data-open={open || undefined}>
      <button type="button" className={styles.closeButton} onClick={onClose}>
        Fechar menu
      </button>
      <p className={styles.organization}>{workspace.name}</p>
      <ClientSelector />
      <nav aria-label="Menu principal" className={styles.nav}>
        {menu.map((group) => (
          <div key={group.key}>
            {group.label && (
              <p className={styles.groupLabel} id={`menu-group-${group.key}`}>
                {group.label}
              </p>
            )}
            <ul
              className={styles.list}
              aria-labelledby={group.label ? `menu-group-${group.key}` : undefined}
            >
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.key}>
                    <Link
                      href={withClient(item.href)}
                      className={styles.item}
                      aria-current={active ? 'page' : undefined}
                      // Also when it is the current page, where the path does not change.
                      onClick={onClose}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className={styles.footer}>
        <span className={styles.userName}>{user.name}</span>
        <button type="button" className={styles.logout} onClick={() => void logout()}>
          Sair
        </button>
      </div>
    </aside>
  );
}
