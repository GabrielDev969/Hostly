import type { QueryClient } from '@tanstack/react-query';
import { http } from 'msw';
import { expect, vi } from 'vitest';
import { navigation } from './navigation';
import { API, server } from './server';

export const URL_TOKEN = 'url-token-5f2c9a7e41d3b8c6';

// Opens the page the way the e-mail link does, with the token in the query string.
export function openWithToken(path: string, token = URL_TOKEN) {
  window.history.replaceState(null, '', `${path}?token=${encodeURIComponent(token)}`);
}

export interface SentRequest {
  method: string;
  url: string;
  body: string;
}

// Records every request to the API before the other handlers answer it. Register after them:
// server.use puts the newest handlers first.
export function recordRequests(): SentRequest[] {
  const sent: SentRequest[] = [];
  server.use(
    http.all(`${API}/*`, async ({ request }) => {
      sent.push({ method: request.method, url: request.url, body: await request.clone().text() });
    }),
  );
  return sent;
}

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;

export function watchConsole() {
  const spies = CONSOLE_METHODS.map((method) =>
    vi.spyOn(console, method).mockImplementation(() => undefined),
  );
  return {
    printed: () => spies.flatMap((spy) => spy.mock.calls.map((args) => args.map(String).join(' '))),
    restore: () => spies.forEach((spy) => spy.mockRestore()),
  };
}

// The token may only travel in the body of the POST that spends it: not in the address bar, storage,
// query or mutation keys, another request's URL, a navigation or the console.
export function expectTokenOnlyInBody(
  token: string,
  {
    queryClient,
    sent,
    console: printed,
    spentBy,
  }: {
    queryClient: QueryClient;
    sent: SentRequest[];
    console: { printed: () => string[] };
    spentBy: string;
  },
) {
  expect(window.location.href).not.toContain(token);
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  for (const query of queryClient.getQueryCache().getAll()) {
    expect(JSON.stringify(query.queryKey)).not.toContain(token);
  }
  for (const mutation of queryClient.getMutationCache().getAll()) {
    expect(JSON.stringify(mutation.options.mutationKey ?? null)).not.toContain(token);
  }
  for (const request of sent) {
    expect(request.url).not.toContain(token);
    if (!request.url.endsWith(spentBy)) expect(request.body).not.toContain(token);
  }
  expect(sent.some((r) => r.url.endsWith(spentBy) && r.body.includes(token))).toBe(true);
  for (const [href] of [
    ...navigation.router.replace.mock.calls,
    ...navigation.router.push.mock.calls,
  ]) {
    expect(href).not.toContain(token);
  }
  for (const line of printed.printed()) expect(line).not.toContain(token);
}
