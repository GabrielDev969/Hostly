import { z } from 'zod';
import { toApiError } from '../api/errors';
import { issuedAt } from './jwt';

const AUTH = '/api/v1/auth';
// 401 on these means wrong credentials or a dead session, never a stale access token.
const NO_RETRY_PATHS = [`${AUTH}/login`, `${AUTH}/refresh`, `${AUTH}/2fa/verify`];
const REFRESH_LOCK = 'session-refresh';
// How long a tab waits for the others to hand over a newer token before renewing it itself.
export const TOKEN_REPLY_TIMEOUT_MS = 150;

const tokenResponse = z.object({ accessToken: z.string().min(1) });
const loginResponse = z.union([
  tokenResponse,
  z.object({ requires2FA: z.literal(true), challenge: z.string().min(1) }),
]);
const channelMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('token'), accessToken: z.string().min(1) }),
  z.object({ type: z.literal('signed-out') }),
  z.object({ type: z.literal('token-request'), id: z.string().min(1) }),
  z.object({
    type: z.literal('token-reply'),
    id: z.string().min(1),
    accessToken: z.string().min(1),
  }),
]);

export type LoginResult = { kind: 'signed-in' } | { kind: 'two-factor'; challenge: string };
export type TokenOrigin = 'local' | 'remote';
type Listener = (token: string | null, origin: TokenOrigin) => void;

export interface LockManagerLike {
  request: <T>(name: string, callback: () => Promise<T>) => Promise<T>;
}

export interface ChannelLike {
  postMessage: (message: unknown) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
}

export interface SessionClientDeps {
  baseUrl: () => string;
  fetch: (request: Request) => Promise<Response>;
  // Same-origin channel to the other tabs. A refresh rotates the session and revokes the previous
  // one, so tabs share one access token instead of each rotating it.
  channel: () => ChannelLike | null;
  // Serializes refreshes across tabs: the API revokes every session of the user when a rotated
  // refresh cookie is presented twice.
  locks: () => LockManagerLike;
}

export interface SessionClient {
  getToken: () => string | null;
  subscribe: (listener: Listener) => () => void;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyTwoFactor: (challenge: string, code: string) => Promise<void>;
  // Resolves to a fresh token, or null when the session is gone. Network and server errors throw.
  refresh: (staleToken: string | null) => Promise<string | null>;
  logout: () => Promise<void>;
  // Sends with the access token; on a 401 renews once and retries once.
  fetch: (request: Request) => Promise<Response>;
}

// A token another tab offers replaces the stale one only if it is a different, not older, token.
function isNewer(candidate: string, stale: string | null): boolean {
  if (candidate === stale) return false;
  if (stale === null) return true;
  return (issuedAt(candidate) ?? 0) >= (issuedAt(stale) ?? 0);
}

export function createSessionClient(deps: SessionClientDeps): SessionClient {
  // Kept in this closure only: never in storage, URLs or logs.
  let token: string | null = null;
  let inflight: Promise<string | null> | null = null;
  let channel: ChannelLike | null | undefined;
  let pending: { id: string; offer: (candidate: string) => void } | null = null;
  const listeners = new Set<Listener>();

  const notify = (origin: TokenOrigin) => listeners.forEach((listener) => listener(token, origin));

  const getChannel = (): ChannelLike | null => {
    if (channel !== undefined) return channel;
    const opened = deps.channel();
    channel = opened;
    opened?.addEventListener('message', (event) => {
      const parsed = channelMessage.safeParse(event.data);
      if (!parsed.success) return;
      const message = parsed.data;
      switch (message.type) {
        case 'token':
          token = message.accessToken;
          notify('remote');
          pending?.offer(message.accessToken);
          break;
        case 'signed-out':
          token = null;
          notify('remote');
          break;
        case 'token-request':
          if (token)
            opened.postMessage({ type: 'token-reply', id: message.id, accessToken: token });
          break;
        case 'token-reply':
          if (pending?.id === message.id) pending.offer(message.accessToken);
          break;
      }
    });
    return channel;
  };

  const acquire = (accessToken: string) => {
    token = accessToken;
    getChannel()?.postMessage({ type: 'token', accessToken });
    notify('local');
  };

  const clear = () => {
    if (token === null) return;
    token = null;
    getChannel()?.postMessage({ type: 'signed-out' });
    notify('local');
  };

  // Asks the other tabs for a token newer than the stale one. A tab that just renewed answers after
  // it holds the new token, which a plain broadcast cannot promise against the lock hand-off.
  const askOtherTabs = (stale: string | null): Promise<string | null> => {
    const opened = getChannel();
    if (!opened) return Promise.resolve(null);
    return new Promise((resolve) => {
      const id = crypto.randomUUID();
      const finish = (result: string | null) => {
        clearTimeout(timer);
        if (pending?.id === id) pending = null;
        resolve(result);
      };
      const timer = setTimeout(() => finish(null), TOKEN_REPLY_TIMEOUT_MS);
      pending = { id, offer: (candidate) => isNewer(candidate, stale) && finish(candidate) };
      opened.postMessage({ type: 'token-request', id });
    });
  };

  const url = (path: string) => `${deps.baseUrl()}${path}`;

  const postJson = (path: string, body: unknown) =>
    deps.fetch(
      new Request(url(path), {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );

  const withToken = (request: Request, accessToken: string | null) => {
    const sent = new Request(request);
    if (accessToken) sent.headers.set('authorization', `Bearer ${accessToken}`);
    return sent;
  };

  const renew = async (staleToken: string | null): Promise<string | null> => {
    // Another tab may have renewed while this one waited for the lock.
    if (token !== null && token !== staleToken) return token;
    const shared = await askOtherTabs(staleToken);
    if (shared) {
      token = shared;
      notify('local');
      return shared;
    }
    const response = await deps.fetch(
      new Request(url(`${AUTH}/refresh`), { method: 'POST', credentials: 'include' }),
    );
    if (response.status === 401) {
      clear();
      return null;
    }
    if (!response.ok) throw await toApiError(response);
    acquire(tokenResponse.parse(await response.json()).accessToken);
    return token;
  };

  const client: SessionClient = {
    getToken: () => token,

    subscribe(listener) {
      getChannel();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async login(email, password) {
      const response = await postJson(`${AUTH}/login`, { email, password });
      if (!response.ok) throw await toApiError(response);
      const body = loginResponse.parse(await response.json());
      if ('requires2FA' in body) return { kind: 'two-factor', challenge: body.challenge };
      acquire(body.accessToken);
      return { kind: 'signed-in' };
    },

    async verifyTwoFactor(challenge, code) {
      const response = await postJson(`${AUTH}/2fa/verify`, { challenge, code });
      if (!response.ok) throw await toApiError(response);
      acquire(tokenResponse.parse(await response.json()).accessToken);
    },

    refresh(staleToken) {
      inflight ??= deps
        .locks()
        .request(REFRESH_LOCK, () => renew(staleToken))
        .finally(() => {
          inflight = null;
        });
      return inflight;
    },

    async logout() {
      try {
        const response = await client.fetch(
          new Request(url(`${AUTH}/logout`), { method: 'POST', credentials: 'include' }),
        );
        if (!response.ok && response.status !== 401) throw await toApiError(response);
      } finally {
        clear();
      }
    },

    async fetch(request) {
      const sentToken = token;
      const retry = request.clone();
      const response = await deps.fetch(withToken(request, sentToken));
      const path = new URL(request.url).pathname;
      if (response.status !== 401 || NO_RETRY_PATHS.includes(path)) return response;
      const fresh = await client.refresh(sentToken);
      if (!fresh) return response;
      return deps.fetch(withToken(retry, fresh));
    },
  };
  return client;
}
