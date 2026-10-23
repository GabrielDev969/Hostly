'use client';

import { useEffect, useEffectEvent, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './dialog.module.css';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// A modal dialog of our own (never the browser's confirm()): focus moves in and stays in, Esc closes, the rest of
// the page is inert, and focus goes back to what opened it. Render it only while open.
export function Dialog({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description: ReactNode;
  // The actions; the first focusable one gets the focus, so put the safe choice first.
  children: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const ref = useRef<HTMLDivElement>(null);

  // On the document, so Esc and Tab work wherever the focus ended up.
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !ref.current) return;
    const focusable = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !ref.current.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !ref.current.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  });

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const host = ref.current?.parentElement ?? null;
    const background = [...document.body.children].filter(
      (element): element is HTMLElement => element instanceof HTMLElement && element !== host,
    );
    const wasInert = background.map((element) => element.inert);
    background.forEach((element) => (element.inert = true));
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    document.addEventListener('keydown', listener);

    return () => {
      document.removeEventListener('keydown', listener);
      background.forEach((element, index) => (element.inert = wasInert[index] ?? false));
      // The opener may be gone (revoking hides the button): fall back to the main content.
      if (opener?.isConnected) opener.focus();
      else document.getElementById('main-content')?.focus();
    };
  }, []);

  return createPortal(
    <div className={styles.backdrop}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={styles.dialog}
      >
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <div id={descriptionId} className={styles.description}>
          {description}
        </div>
        <div className={styles.actions}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
