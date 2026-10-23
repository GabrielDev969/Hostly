'use client';

import { LIVE_SOCKET_PATH } from '@hostly/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { unwrap } from '@/lib/api/client';
import { apiUrl } from '@/lib/env';
import { usePanelSession } from '@/lib/session/session-provider';
import { robotKeys } from '../queries';
import styles from '../robots.module.css';
import { applyLiveEvent } from './apply-live-event';
import { LiveConnection, type LiveStatus } from './live-connection';

const LiveStatusContext = createContext<LiveStatus>('connecting');

export function useLiveStatus(): LiveStatus {
  return useContext(LiveStatusContext);
}

// One live connection for the robots section: list and detail share it, since the layout stays mounted between
// them. Leaving the section or losing the session (AuthGate stops rendering the panel) unmounts it and closes the
// socket; StrictMode's extra mount stops the first connection before it opens.
export function LiveRobotsProvider({
  children,
  delay,
}: {
  children: ReactNode;
  // Tests shorten the backoff.
  delay?: (attempt: number) => number;
}) {
  const { workspace, api } = usePanelSession();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const workspaceId = workspace.id;

  useEffect(() => {
    const connection = new LiveConnection({
      requestTicket: async (signal) => {
        const { ticket } = await unwrap(
          api().POST('/api/v1/live/tickets', {
            params: { header: { 'x-workspace-id': workspaceId } },
            signal,
          }),
        );
        return ticket;
      },
      url: () => `${apiUrl().replace(/^http/, 'ws')}${LIVE_SOCKET_PATH}`,
      onEvent: (event) => applyLiveEvent(queryClient, workspaceId, event),
      // Reload over REST on every open, the first included: no gap between the snapshot and the stream, and a robot
      // that left the scope (no "left" event exists) drops out.
      onOpen: () => void queryClient.invalidateQueries({ queryKey: robotKeys.all(workspaceId) }),
      onStatus: setStatus,
      delay,
    });
    connection.start();
    return () => connection.stop();
  }, [api, queryClient, workspaceId, delay]);

  return <LiveStatusContext.Provider value={status}>{children}</LiveStatusContext.Provider>;
}

// Discreet: the screens keep the last state they had while it shows.
export function LiveNotice() {
  const status = useLiveStatus();
  const text =
    status === 'reconnecting'
      ? 'Ao vivo desconectado, reconectando…'
      : status === 'unavailable'
        ? 'Ao vivo indisponível. Recarregue a página para tentar de novo.'
        : '';
  return (
    <p
      role="status"
      aria-live="polite"
      className={text ? styles.liveNotice : styles.liveNoticeEmpty}
    >
      {text}
    </p>
  );
}
