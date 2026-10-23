'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api/errors';
import { SessionProvider } from '@/lib/session/session-provider';
import type { SessionClient } from '@/lib/session/session-client';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A 4xx will not change on retry; network and 5xx get two more tries.
        retry: (failures, error) =>
          !(error instanceof ApiError && error.status < 500) && failures < 2,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function Providers({
  children,
  sessionClient,
  queryClient: injectedQueryClient,
}: {
  children: ReactNode;
  sessionClient?: SessionClient;
  queryClient?: QueryClient;
}) {
  const [queryClient] = useState(() => injectedQueryClient ?? createQueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider client={sessionClient}>{children}</SessionProvider>
    </QueryClientProvider>
  );
}
