'use client';

import { useEffect, useRef, useState } from 'react';

export type UrlToken = { status: 'reading' } | { status: 'read'; token: string | null };

// The e-mail links carry a one-time token in ?token=. It leaves the address bar as soon as the page
// opens and lives only in this state: never in storage, query keys, logs or another request's URL.
// Read once: StrictMode runs the effect twice, and the second run would find the bar already clean.
export function useUrlToken(): UrlToken {
  const [state, setState] = useState<UrlToken>({ status: 'reading' });
  const read = useRef(false);

  useEffect(() => {
    if (read.current) return;
    read.current = true;
    const url = new URL(window.location.href);
    const token = url.searchParams.get('token');
    if (token !== null) {
      url.searchParams.delete('token');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
    setState({ status: 'read', token: token || null });
  }, []);

  return state;
}
