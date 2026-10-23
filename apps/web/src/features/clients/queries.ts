'use client';

import { useMemo } from 'react';
import { useRobots, useSites, type Robot } from '@/features/robots/queries';
import { usePanelSession } from '@/lib/session/session-provider';

// The key useClientFilter reads: invalidating it refreshes this page and the menu's client selector.
export const clientsKey = (workspaceId: string) => ['clients', workspaceId] as const;

// Comfort only: each block and button shows with its permission, and the API refuses without it.
export function useClientsPermissions() {
  const { membership } = usePanelSession();
  const held = new Set(membership.permissions);
  return {
    canCreate: held.has('client:create'),
    canUpdate: held.has('client:update'),
    canReadSites: held.has('site:read'),
    canCreateSite: held.has('site:create'),
    canUpdateSite: held.has('site:update'),
    canReadRobots: held.has('robot:read'),
    canReadMembers: held.has('workspace:read'),
    canReadInvitations: held.has('workspace:invite'),
    canReadRoles: held.has('role:read'),
    // Inviting picks a role, so it needs the role list too.
    canInvite: held.has('workspace:invite') && held.has('role:read'),
  };
}

// A revoked robot must be paired again: it no longer counts as linked to its site.
const linked = (robot: Robot) => robot.status !== 'revoked';

// Sites and linked robots of every client in scope, from the lists the panel already loads (no count route).
export function useClientInventory() {
  const { canReadSites, canReadRobots } = useClientsPermissions();
  const sites = useSites();
  const robots = useRobots(null, canReadRobots);
  return useMemo(() => {
    const linkedRobots = (robots.data ?? []).filter(linked);
    return {
      sites: canReadSites ? sites.sites : null,
      robots: canReadRobots ? linkedRobots : null,
      sitesError: sites.isError,
      robotsError: robots.isError,
    };
  }, [canReadSites, canReadRobots, sites.sites, sites.isError, robots.data, robots.isError]);
}
