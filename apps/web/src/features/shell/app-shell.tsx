'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NoAccess } from '@/components/states';
import { useFocusTrap } from '@/components/use-focus-trap';
import { usePanelSession } from '@/lib/session/session-provider';
import { buildMenu, findMenuItem, isInMenu } from './menu';
import styles from './shell.module.css';
import { Sidebar } from './sidebar';

// The phone layout; keep in sync with the @media in globals.css and shell.module.css.
const MOBILE_QUERY = '(max-width: 767px)';
const MENU_ID = 'main-menu';

export function AppShell({ children }: { children: ReactNode }) {
  const { workspace, membership } = usePanelSession();
  const pathname = usePathname();
  const menu = useMemo(
    () => buildMenu({ scopeKind: membership.scope.kind, permissions: membership.permissions }),
    [membership],
  );
  const item = findMenuItem(pathname);
  const allowed = !item || isInMenu(menu, item.key);

  // The phone menu is open on the page it was opened on: any navigation (a link, the back button) closes it.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  const close = useCallback(() => setOpenedAt(null), []);

  const skipLinkRef = useRef<HTMLAnchorElement>(null);
  const topbarRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  useFocusTrap(menuRef, {
    active: open,
    onEscape: close,
    background: () =>
      [skipLinkRef.current, topbarRef.current, mainRef.current].filter(
        (element): element is HTMLElement => element !== null,
      ),
    // Not the focused element: Safari does not focus a button on click.
    returnFocus: () => toggleRef.current,
  });

  useEffect(() => {
    if (!open) return;
    // A tap outside the panel (on the backdrop) closes it.
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) close();
    };
    document.addEventListener('click', onClick);
    // Growing past the phone width (turning a tablet) leaves no panel to see: close it.
    const query = typeof window.matchMedia === 'function' ? window.matchMedia(MOBILE_QUERY) : null;
    const onChange = () => {
      if (!query?.matches) close();
    };
    query?.addEventListener('change', onChange);
    return () => {
      document.removeEventListener('click', onClick);
      query?.removeEventListener('change', onChange);
    };
  }, [open, close]);

  return (
    <div className={styles.shell}>
      <a ref={skipLinkRef} href="#main-content" className={styles.skipLink}>
        Pular para o conteúdo
      </a>
      <header ref={topbarRef} className={styles.topbar}>
        <button
          ref={toggleRef}
          type="button"
          className={styles.menuButton}
          aria-expanded={open}
          aria-controls={MENU_ID}
          onClick={() => setOpenedAt(pathname)}
        >
          Menu
        </button>
        <p className={styles.topbarOrganization}>{workspace.name}</p>
      </header>
      {open && <div className={styles.backdrop} aria-hidden="true" />}
      <Sidebar ref={menuRef} id={MENU_ID} menu={menu} open={open} onClose={close} />
      <main ref={mainRef} id="main-content" tabIndex={-1} className={styles.main}>
        <div className={styles.content}>{allowed ? children : <NoAccess />}</div>
      </main>
    </div>
  );
}
