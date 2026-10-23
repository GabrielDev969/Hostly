'use client';

import { useEffect, useEffectEvent, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Modal focus, shared by the Dialog and the phone menu: while active, the background is inert, focus moves in and
// stays in, and Esc calls onEscape. When it ends, the background comes back before focus returns, or the target
// would still be inert and refuse the focus.
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  {
    active,
    onEscape,
    background,
    returnFocus,
  }: {
    active: boolean;
    onEscape: () => void;
    // The elements to make inert, read when it activates.
    background: () => HTMLElement[];
    // Where focus goes back to; the element focused at activation when absent.
    returnFocus?: () => HTMLElement | null;
  },
) {
  // On the document, so Esc and Tab work wherever the focus ended up.
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onEscape();
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
    const current = document.activeElement;
    if (event.shiftKey && (current === first || !ref.current.contains(current))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (current === last || !ref.current.contains(current))) {
      event.preventDefault();
      first.focus();
    }
  });
  const getBackground = useEffectEvent(background);
  const getReturnTarget = useEffectEvent(() => returnFocus?.() ?? null);

  useEffect(() => {
    if (!active) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const inertElements = getBackground();
    const wasInert = inertElements.map((element) => element.inert);
    inertElements.forEach((element) => (element.inert = true));
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    document.addEventListener('keydown', listener);

    return () => {
      document.removeEventListener('keydown', listener);
      inertElements.forEach((element, index) => (element.inert = wasInert[index] ?? false));
      const target = getReturnTarget() ?? opener;
      // The target may be gone (revoking hides the button): fall back to the main content.
      if (target?.isConnected) target.focus();
      else document.getElementById('main-content')?.focus();
    };
  }, [active, ref]);
}
