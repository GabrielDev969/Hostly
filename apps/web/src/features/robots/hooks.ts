'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePanelSession } from '@/lib/session/session-provider';
import { CLIENT_PARAM, useClientFilter } from '@/features/shell/use-client-filter';

// Ticks so a relative time ("há 12 s") keeps moving between events.
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

// Keeps the operator's client choice on the robots links, like the menu does.
export function useWithClient(): (href: string) => string {
  const { membership } = usePanelSession();
  const { clientId } = useClientFilter();
  const operator = membership.scope.kind === 'operator';
  return useCallback(
    (href: string) => (operator && clientId ? `${href}?${CLIENT_PARAM}=${clientId}` : href),
    [operator, clientId],
  );
}

// Comfort only: the API refuses an action without the permission. Client roles never hold these (ceiling).
export function useRobotPermissions() {
  const { membership } = usePanelSession();
  const held = new Set(membership.permissions);
  return {
    canRename: held.has('robot:update'),
    canMove: held.has('robot:move'),
    canRevoke: held.has('robot:revoke'),
  };
}
