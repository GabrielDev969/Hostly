'use client';

import { useQuery } from '@tanstack/react-query';
import { unwrap, type Schemas } from '@/lib/api/client';
import { usePanelSession } from '@/lib/session/session-provider';

export type Robot = Schemas['RobotResponseDto'];
export type Site = Schemas['SiteResponseDto'];
export type TelemetryHistory = Schemas['RobotTelemetryHistoryDto'];
export type TelemetryPoint = Schemas['RobotTelemetryPointDto'];

export const HISTORY_HOURS = 24;
// The chart moves one 5-minute bucket at a time; live events update the status, not the chart.
const HISTORY_REFRESH_MS = 5 * 60 * 1000;

// Everything under robotKeys.all is reloaded when the live channel (re)opens.
export const robotKeys = {
  all: (workspaceId: string) => ['robots', workspaceId] as const,
  lists: (workspaceId: string) => ['robots', workspaceId, 'list'] as const,
  list: (workspaceId: string, clientId: string | null) =>
    ['robots', workspaceId, 'list', clientId] as const,
  detail: (workspaceId: string, id: string) => ['robots', workspaceId, 'detail', id] as const,
  history: (workspaceId: string, id: string) => ['robot-history', workspaceId, id] as const,
  sites: (workspaceId: string) => ['sites', workspaceId] as const,
};

export function useRobots(clientId: string | null, enabled = true) {
  const { workspace, api } = usePanelSession();
  return useQuery({
    queryKey: robotKeys.list(workspace.id, clientId),
    queryFn: () =>
      unwrap(
        api().GET('/api/v1/robots', {
          params: {
            header: { 'x-workspace-id': workspace.id },
            query: clientId ? { clientId } : {},
          },
        }),
      ),
    enabled,
  });
}

export function useRobot(id: string, enabled: boolean) {
  const { workspace, api } = usePanelSession();
  return useQuery({
    queryKey: robotKeys.detail(workspace.id, id),
    queryFn: () =>
      unwrap(
        api().GET('/api/v1/robots/{id}', {
          params: { path: { id }, header: { 'x-workspace-id': workspace.id } },
        }),
      ),
    enabled,
  });
}

export function useRobotHistory(id: string) {
  const { workspace, api } = usePanelSession();
  return useQuery({
    queryKey: robotKeys.history(workspace.id, id),
    queryFn: () =>
      unwrap(
        api().GET('/api/v1/robots/{id}/telemetry', {
          params: {
            path: { id },
            header: { 'x-workspace-id': workspace.id },
            query: { hours: HISTORY_HOURS },
          },
        }),
      ),
    refetchInterval: HISTORY_REFRESH_MS,
  });
}

// Site names for the screens; without site:read the screens show "—" instead of an id.
export function useSites() {
  const { workspace, membership, api } = usePanelSession();
  const canRead = membership.permissions.includes('site:read');
  const query = useQuery({
    queryKey: robotKeys.sites(workspace.id),
    queryFn: () =>
      unwrap(
        api().GET('/api/v1/sites', { params: { header: { 'x-workspace-id': workspace.id } } }),
      ),
    enabled: canRead,
  });
  return { ...query, sites: query.data ?? [] };
}
