import { http, HttpResponse } from 'msw';
import { CLIENTS, fakeToken, ME, membershipFor, type RoleName } from './fixtures';
import { API } from './server';

export const ACCESS_TOKEN = fakeToken('access');

export interface ApiCalls {
  refresh: number;
  logout: { authorization: string | null }[];
  requests: string[];
}

// A signed-in user with the given role. The refresh cookie is simulated by `cookie.valid`.
export function panelHandlers(role: RoleName, options: { refreshValid?: boolean } = {}) {
  const calls: ApiCalls = { refresh: 0, logout: [], requests: [] };
  const cookie = { valid: options.refreshValid ?? true };
  const authorized = (request: Request) =>
    request.headers.get('authorization') === `Bearer ${ACCESS_TOKEN}`;
  const unauthorized = () =>
    HttpResponse.json({ statusCode: 401, message: 'Unauthorized' }, { status: 401 });

  const handlers = [
    http.all(`${API}/*`, ({ request }) => {
      calls.requests.push(request.url);
    }),
    http.post(`${API}/api/v1/auth/refresh`, () => {
      calls.refresh += 1;
      if (!cookie.valid) return unauthorized();
      return HttpResponse.json({ accessToken: ACCESS_TOKEN });
    }),
    http.get(`${API}/api/v1/auth/me`, ({ request }) =>
      authorized(request) ? HttpResponse.json(ME) : unauthorized(),
    ),
    http.get(`${API}/api/v1/workspaces/:workspaceId/me`, ({ request }) =>
      authorized(request) ? HttpResponse.json(membershipFor(role)) : unauthorized(),
    ),
    http.get(`${API}/api/v1/clients`, ({ request }) => {
      if (!authorized(request)) return unauthorized();
      const scope = membershipFor(role).scope;
      return HttpResponse.json(
        scope.kind === 'operator' ? CLIENTS : CLIENTS.filter((c) => c.id === scope.clientId),
      );
    }),
    http.post(`${API}/api/v1/auth/logout`, ({ request }) => {
      calls.logout.push({ authorization: request.headers.get('authorization') });
      cookie.valid = false;
      return new HttpResponse(null, { status: 204 });
    }),
  ];
  return { handlers, calls, cookie };
}
