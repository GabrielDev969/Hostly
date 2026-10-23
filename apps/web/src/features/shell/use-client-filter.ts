'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { unwrap, type Schemas } from '@/lib/api/client';
import { usePanelSession } from '@/lib/session/session-provider';

export type Client = Schemas['ClientResponseDto'];

export const CLIENT_PARAM = 'client';

export interface ClientFilter {
  // The client the screens should filter by; null means every client the API returns.
  clientId: string | null;
  clients: Client[];
  // The selector shows only with client:read and never for advertisers.
  visible: boolean;
  // A client user always sees their own client, fixed.
  fixed: boolean;
  isLoading: boolean;
  isError: boolean;
  setClientId: (clientId: string | null) => void;
}

export function useClientFilter(): ClientFilter {
  const { workspace, membership, api } = usePanelSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const kind = membership.scope.kind;
  const canRead = membership.permissions.includes('client:read');

  const query = useQuery({
    queryKey: ['clients', workspace.id],
    queryFn: () =>
      unwrap(
        api().GET('/api/v1/clients', { params: { header: { 'x-workspace-id': workspace.id } } }),
      ),
    enabled: canRead && kind !== 'advertiser',
  });
  const clients = query.data ?? [];

  // Only an id the API returned is honored, so the URL never selects data the user cannot see.
  const requested = searchParams.get(CLIENT_PARAM);
  const clientId =
    kind === 'operator'
      ? requested && clients.some((client) => client.id === requested)
        ? requested
        : null
      : membership.scope.clientId;

  const setClientId = useCallback(
    (next: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set(CLIENT_PARAM, next);
      else params.delete(CLIENT_PARAM);
      const search = params.toString();
      router.replace(search ? `${pathname}?${search}` : pathname);
    },
    [pathname, router, searchParams],
  );

  return {
    clientId,
    clients,
    visible: canRead && kind !== 'advertiser',
    fixed: kind === 'client',
    isLoading: query.isLoading,
    isError: query.isError,
    setClientId,
  };
}
