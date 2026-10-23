import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { fakeToken } from '../../../test/fixtures';
import { API, server } from '../../../test/server';
import { channelHub, memoryLocks, testSessionDeps } from '../../../test/session-deps';
import { createSessionClient } from './session-client';

const OLD = fakeToken('old', 1_000);
const NEW = fakeToken('new', 2_000);
const PROTECTED = `${API}/api/v1/robots`;

// One API: login hands out OLD, refresh rotates to NEW, the protected route only takes NEW.
function api(options: { refresh?: 'ok' | 'expired' } = {}) {
  const calls = { refresh: 0, protectedTokens: [] as (string | null)[] };
  server.use(
    http.post(`${API}/api/v1/auth/login`, () => HttpResponse.json({ accessToken: OLD })),
    http.post(`${API}/api/v1/auth/refresh`, () => {
      calls.refresh += 1;
      return options.refresh === 'expired'
        ? HttpResponse.json({ message: 'Invalid session' }, { status: 401 })
        : HttpResponse.json({ accessToken: NEW });
    }),
    http.get(PROTECTED, ({ request }) => {
      const authorization = request.headers.get('authorization');
      calls.protectedTokens.push(authorization);
      return authorization === `Bearer ${NEW}`
        ? HttpResponse.json([])
        : HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }),
    http.post(`${API}/api/v1/auth/logout`, () => new HttpResponse(null, { status: 204 })),
  );
  return calls;
}

const get = (client: ReturnType<typeof createSessionClient>) =>
  client.fetch(new Request(PROTECTED));

describe('session client', () => {
  it('renews once for parallel 401s and retries each request once', async () => {
    const calls = api();
    const client = createSessionClient(testSessionDeps());
    await client.login('ana@example.com', 'secret');

    const responses = await Promise.all([get(client), get(client), get(client)]);

    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(calls.refresh).toBe(1);
    expect(calls.protectedTokens.filter((t) => t === `Bearer ${NEW}`)).toHaveLength(3);
    expect(client.getToken()).toBe(NEW);
  });

  it('signs out without looping when the refresh is refused', async () => {
    const calls = api({ refresh: 'expired' });
    const client = createSessionClient(testSessionDeps());
    const listener = vi.fn();
    client.subscribe(listener);
    await client.login('ana@example.com', 'secret');

    const response = await get(client);

    expect(response.status).toBe(401);
    expect(calls.refresh).toBe(1);
    expect(calls.protectedTokens).toEqual([`Bearer ${OLD}`]);
    expect(client.getToken()).toBeNull();
    expect(listener).toHaveBeenLastCalledWith(null, 'local');
  });

  it('stays anonymous when the page opens without a refresh cookie', async () => {
    const calls = api({ refresh: 'expired' });
    const client = createSessionClient(testSessionDeps());

    await expect(client.refresh(null)).resolves.toBeNull();
    expect(calls.refresh).toBe(1);
  });

  it('never retries a 401 from login', async () => {
    const calls = api();
    server.use(
      http.post(`${API}/api/v1/auth/login`, () =>
        HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 }),
      ),
    );
    const client = createSessionClient(testSessionDeps());

    await expect(client.login('ana@example.com', 'wrong')).rejects.toMatchObject({ status: 401 });
    expect(calls.refresh).toBe(0);
  });

  it('logs out with the bearer token and the cookie, then forgets the token', async () => {
    api();
    const sent: Request[] = [];
    const client = createSessionClient(testSessionDeps({ sent }));
    await client.login('ana@example.com', 'secret');

    await client.logout();

    const logout = sent.find((request) => request.url.endsWith('/auth/logout'));
    expect(logout?.headers.get('authorization')).toBe(`Bearer ${OLD}`);
    expect(logout?.credentials).toBe('include');
    expect(client.getToken()).toBeNull();
  });

  it('sends the cookie only to the auth routes', async () => {
    api();
    const sent: Request[] = [];
    const client = createSessionClient(testSessionDeps({ sent }));
    await client.login('ana@example.com', 'secret');
    await get(client);

    const credentials = Object.fromEntries(
      sent.map((request) => [new URL(request.url).pathname, request.credentials]),
    );
    expect(credentials).toEqual({
      '/api/v1/auth/login': 'include',
      '/api/v1/auth/refresh': 'include',
      '/api/v1/robots': 'same-origin',
    });
  });

  it('forgets the token even when the logout call fails', async () => {
    api();
    server.use(http.post(`${API}/api/v1/auth/logout`, () => HttpResponse.error()));
    const client = createSessionClient(testSessionDeps());
    await client.login('ana@example.com', 'secret');

    await expect(client.logout()).rejects.toThrow();
    expect(client.getToken()).toBeNull();
  });
});

describe('session client across tabs', () => {
  const browser = () => {
    const channel = channelHub();
    const locks = memoryLocks();
    return () => createSessionClient(testSessionDeps({ channel, locks }));
  };

  it('renews once when two tabs get a 401 at the same time, and both go on with the new token', async () => {
    const calls = api();
    const openTab = browser();
    const tabA = openTab();
    const tabB = openTab();
    tabA.subscribe(() => undefined);
    tabB.subscribe(() => undefined);
    await tabA.login('ana@example.com', 'secret');
    await vi.waitFor(() => expect(tabB.getToken()).toBe(OLD));

    const [a, b] = await Promise.all([get(tabA), get(tabB)]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(calls.refresh).toBe(1);
    expect(tabA.getToken()).toBe(NEW);
    expect(tabB.getToken()).toBe(NEW);
  });

  it('lets a new tab take the token of an open one instead of rotating the session', async () => {
    const calls = api();
    const openTab = browser();
    const tabA = openTab();
    tabA.subscribe(() => undefined);
    await tabA.login('ana@example.com', 'secret');

    const tabB = openTab();
    await expect(tabB.refresh(null)).resolves.toBe(OLD);
    expect(calls.refresh).toBe(0);
  });

  it('renews by itself when no other tab answers', async () => {
    const calls = api();
    const tab = browser()();
    tab.subscribe(() => undefined);

    await expect(tab.refresh(null)).resolves.toBe(NEW);
    expect(calls.refresh).toBe(1);
  });

  it('signs the other tabs out on logout', async () => {
    api();
    const openTab = browser();
    const tabA = openTab();
    const tabB = openTab();
    const listenerB = vi.fn();
    tabA.subscribe(() => undefined);
    tabB.subscribe(listenerB);
    await tabA.login('ana@example.com', 'secret');
    await vi.waitFor(() => expect(tabB.getToken()).toBe(OLD));

    await tabA.logout();

    await vi.waitFor(() => expect(tabB.getToken()).toBeNull());
    expect(listenerB).toHaveBeenLastCalledWith(null, 'remote');
  });

  it('ignores messages that are not session messages', async () => {
    api();
    const channel = channelHub();
    const tab = createSessionClient(testSessionDeps({ channel }));
    tab.subscribe(() => undefined);
    const intruder = channel();

    intruder.postMessage({ type: 'token' });
    intruder.postMessage('hello');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(tab.getToken()).toBeNull();
  });
});

describe('token hygiene', () => {
  const consoleSpies: MockInstance<(...args: unknown[]) => void>[] = [];

  beforeEach(() => {
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      consoleSpies.push(vi.spyOn(console, method).mockImplementation(() => undefined));
    }
  });

  afterEach(() => {
    consoleSpies.splice(0).forEach((spy) => spy.mockRestore());
  });

  it('keeps tokens out of storage and logs through login, refresh and logout', async () => {
    api();
    const channel = channelHub();
    const tab = createSessionClient(testSessionDeps({ channel }));
    tab.subscribe(() => undefined);

    await tab.login('ana@example.com', 'secret');
    await get(tab);
    await tab.logout();

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    const logged = JSON.stringify(consoleSpies.map((spy) => spy.mock.calls));
    expect(logged).not.toContain(OLD);
    expect(logged).not.toContain(NEW);
  });
});
