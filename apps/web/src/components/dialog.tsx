'use client';

import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './dialog.module.css';
import { useFocusTrap } from './use-focus-trap';

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

  useFocusTrap(ref, {
    active: true,
    onEscape: onClose,
    // Everything but the portal host.
    background: () => {
      const host = ref.current?.parentElement ?? null;
      return [...document.body.children].filter(
        (element): element is HTMLElement => element instanceof HTMLElement && element !== host,
      );
    },
  });

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
