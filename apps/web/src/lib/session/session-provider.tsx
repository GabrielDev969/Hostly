'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createApiClient, unwrap, type ApiClient, type Schemas } from '../api/client';
import { ApiError } from '../api/errors';
import { apiUrl } from '../env';
import { browserSession } from './browser-session';
import { subjectOf } from './jwt';
import type { LoginResult, SessionClient } from './session-client';

export type Me = Schemas['MeResponseDto'];
export type Workspace = Schemas['MeWorkspaceDto'];
export type Membership = Schemas['WorkspaceMeResponseDto'];

// none: no session when the page opened; expired: the refresh was refused; signed-out: logout here
// or in another tab.
export type AnonymousReason = 'none' | 'expired' | 'signed-out';

export type SessionState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'anonymous'; reason: AnonymousReason }
  | {
      status: 'authenticated';
      user: Me;
      workspace: Workspace | null;
      membership: Membership | null;
    };

interface SessionContextValue {
  state: SessionState;
  api: () => ApiClient;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyTwoFactor: (challenge: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  selectWorkspace: (workspaceId: string) => Promise<void>;
  // Reloads the user's workspaces (after joining one) and enters the given one when it is listed.
  reloadProfile: (workspaceId?: string) => Promise<void>;
  retry: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  client: injected,
  children,
}: {
  client?: SessionClient;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [client] = useState(() => injected ?? browserSession());
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const apiRef = useRef<ApiClient | null>(null);
  const userRef = useRef<Me | null>(null);
  const loggingOut = useRef(false);
  const booted = useRef(false);

  // Created on first use: the API URL is read in the browser, never while prerendering.
  const api = useCallback(() => (apiRef.current ??= createApiClient(client, apiUrl())), [client]);

  const signedOut = useCallback(
    (reason: AnonymousReason) => {
      userRef.current = null;
      queryClient.clear();
      setState({ status: 'anonymous', reason });
    },
    [queryClient],
  );

  const settle = useCallback(
    async (task: () => Promise<void>) => {
      try {
        await task();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) signedOut('expired');
        else setState({ status: 'error', error });
      }
    },
    [signedOut],
  );

  const loadMembership = useCallback(
    (workspaceId: string) =>
      unwrap(
        api().GET('/api/v1/workspaces/{workspaceId}/me', { params: { path: { workspaceId } } }),
      ),
    [api],
  );

  const loadProfile = useCallback(
    async (preferredId?: string) => {
      const user = await unwrap(api().GET('/api/v1/auth/me'));
      const workspace =
        user.workspaces.find((w) => w.id === preferredId) ??
        (user.workspaces.length === 1 ? user.workspaces[0]! : null);
      const membership = workspace ? await loadMembership(workspace.id) : null;
      userRef.current = user;
      setState({ status: 'authenticated', user, workspace, membership });
    },
    [api, loadMembership],
  );

  const boot = useCallback(
    () =>
      settle(async () => {
        setState({ status: 'loading' });
        const token = await client.refresh(null);
        if (!token) {
          setState({ status: 'anonymous', reason: 'none' });
          return;
        }
        await loadProfile();
      }),
    [client, loadProfile, settle],
  );

  useEffect(
    () =>
      client.subscribe((token, origin) => {
        if (token === null) {
          signedOut(loggingOut.current || origin === 'remote' ? 'signed-out' : 'expired');
          return;
        }
        // Another tab signed in or renewed: reload the profile only if the user changed.
        if (origin === 'remote' && userRef.current?.id !== subjectOf(token))
          void settle(loadProfile);
      }),
    [client, loadProfile, settle, signedOut],
  );

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void boot();
  }, [boot]);

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      api,
      async login(email, password) {
        const result = await client.login(email, password);
        if (result.kind === 'signed-in') await settle(loadProfile);
        return result;
      },
      async verifyTwoFactor(challenge, code) {
        await client.verifyTwoFactor(challenge, code);
        await settle(loadProfile);
      },
      async logout() {
        loggingOut.current = true;
        try {
          await client.logout();
        } finally {
          loggingOut.current = false;
          signedOut('signed-out');
        }
      },
      selectWorkspace: (workspaceId) =>
        settle(async () => {
          const user = userRef.current;
          const workspace = user?.workspaces.find((w) => w.id === workspaceId);
          if (!user || !workspace) throw new Error('Workspace not available to this user');
          const membership = await loadMembership(workspace.id);
          setState({ status: 'authenticated', user, workspace, membership });
        }),
      reloadProfile: (workspaceId) => settle(() => loadProfile(workspaceId)),
      retry: boot,
    }),
    [state, api, client, settle, loadProfile, loadMembership, signedOut, boot],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}

// For components that only render behind AuthGate, where the membership is already loaded.
export function usePanelSession() {
  const { state, api, logout } = useSession();
  if (state.status !== 'authenticated' || !state.workspace || !state.membership) {
    throw new Error('usePanelSession must be used behind AuthGate');
  }
  return {
    user: state.user,
    workspace: state.workspace,
    membership: state.membership,
    api,
    logout,
  };
}
