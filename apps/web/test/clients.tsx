import { http, HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import PanelLayout from '@/app/(panel)/layout';
import ClientsLayout from '@/app/(panel)/clients/layout';
import type { Schemas } from '@/lib/api/client';
import { CLIENT_A, type RoleName } from './fixtures';
import { ACCESS_TOKEN, panelHandlers } from './handlers';
import { setLocation } from './navigation';
import { renderWithSession } from './render';
import { liveSocket, robotFixture, ROBOTS, robotsApi, SITE_A } from './robots';
import { API, server } from './server';
import { SETTINGS_CLIENTS, SETTINGS_SITES, settingsApi } from './settings';

type Client = Schemas['ClientResponseDto'];
type Site = Schemas['SiteResponseDto'];

const PAST = '2026-01-01T12:00:00.000Z';

// A client with no site, robot or person yet.
export const CLIENT_C = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export const ROBOT_REVOKED = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

export const CLIENTS_PAGE_CLIENTS: Client[] = [
  ...SETTINGS_CLIENTS,
  {
    id: CLIENT_C,
    name: 'Shopping Gama',
    status: 'onboarding',
    isInternal: false,
    createdAt: PAST,
    updatedAt: PAST,
  },
] as Client[];

export const CLIENTS_PAGE_SITES: Site[] = SETTINGS_SITES.map((site) =>
  site.id === SITE_A ? { ...site, address: 'Av. Alfa, 100' } : site,
);

// Revoked robots are not linked to their site any more: the page leaves them out.
export const CLIENTS_PAGE_ROBOTS = [
  ...ROBOTS,
  robotFixture({
    id: ROBOT_REVOKED,
    serial: 'LB0000000003',
    name: 'Robô Velho',
    status: 'revoked',
    online: false,
  }),
];

export interface Reply {
  status: number;
  message?: string;
  details?: string[];
}

export interface ClientsCalls {
  // Every request URL the panel sent, to prove what a permission keeps it from asking.
  urls: string[];
  creates: unknown[];
  updates: { id: string; body: unknown }[];
  siteCreates: unknown[];
  siteUpdates: { id: string; body: unknown }[];
}

type ReplyKey = 'create' | 'update' | 'siteCreate' | 'siteUpdate';

// The clients and sites API as an operator sees it. Each write takes the next queued reply, if any; then succeeds
// and changes what the next GET returns.
export function clientsApi(options: { replies?: Partial<Record<ReplyKey, Reply[]>> } = {}) {
  const clients = structuredClone(CLIENTS_PAGE_CLIENTS);
  const sites = structuredClone(CLIENTS_PAGE_SITES);
  const calls: ClientsCalls = {
    urls: [],
    creates: [],
    updates: [],
    siteCreates: [],
    siteUpdates: [],
  };
  const replies = options.replies ?? {};
  const authorized = (request: Request) =>
    request.headers.get('authorization') === `Bearer ${ACCESS_TOKEN}`;
  const queued = (key: ReplyKey) => {
    const reply = replies[key]?.shift();
    if (!reply) return null;
    const message = reply.message ?? (reply.details ? 'Validation failed' : `HTTP ${reply.status}`);
    return HttpResponse.json(
      { statusCode: reply.status, message, ...(reply.details ? { details: reply.details } : {}) },
      { status: reply.status },
    );
  };
  let next = 0;
  const newId = (prefix: string) => `${prefix}${String(++next).padStart(12, '0')}`;

  const handlers = [
    http.all(`${API}/*`, ({ request }) => {
      calls.urls.push(request.url);
    }),
    http.get(`${API}/api/v1/clients`, ({ request }) =>
      authorized(request) ? HttpResponse.json(clients) : new HttpResponse(null, { status: 401 }),
    ),
    http.post(`${API}/api/v1/clients`, async ({ request }) => {
      const body = (await request.json()) as { name: string; status: Client['status'] };
      calls.creates.push(body);
      const refused = queued('create');
      if (refused) return refused;
      const created: Client = {
        id: newId('ffffffff-ffff-4fff-8fff-'),
        isInternal: false,
        createdAt: PAST,
        updatedAt: PAST,
        ...body,
      };
      clients.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(`${API}/api/v1/clients/:id`, async ({ request, params }) => {
      const body = (await request.json()) as Partial<Client>;
      calls.updates.push({ id: String(params.id), body });
      const refused = queued('update');
      if (refused) return refused;
      const client = clients.find((c) => c.id === params.id)!;
      Object.assign(client, body);
      return HttpResponse.json(client);
    }),
    http.get(`${API}/api/v1/sites`, ({ request }) =>
      authorized(request) ? HttpResponse.json(sites) : new HttpResponse(null, { status: 401 }),
    ),
    http.post(`${API}/api/v1/sites`, async ({ request }) => {
      const body = (await request.json()) as Pick<Site, 'clientId' | 'name' | 'timezone'> & {
        address?: string;
      };
      calls.siteCreates.push(body);
      const refused = queued('siteCreate');
      if (refused) return refused;
      const created: Site = {
        id: newId('12121212-1212-4121-8121-'),
        createdAt: PAST,
        updatedAt: PAST,
        ...body,
        address: body.address ?? null,
      };
      sites.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(`${API}/api/v1/sites/:id`, async ({ request, params }) => {
      const body = (await request.json()) as Partial<Site>;
      calls.siteUpdates.push({ id: String(params.id), body });
      const refused = queued('siteUpdate');
      if (refused) return refused;
      const site = sites.find((s) => s.id === params.id)!;
      Object.assign(site, body);
      return HttpResponse.json(site);
    }),
  ];
  return { handlers, calls, clients, sites };
}

// The Clients section inside the panel shell, as the role sees it.
export function renderClients(
  page: ReactElement,
  {
    role = 'operator_admin',
    path = `/clients/${CLIENT_A}`,
    permissions,
    replies,
  }: {
    role?: RoleName;
    path?: string;
    permissions?: string[];
    replies?: Partial<Record<ReplyKey, Reply[]>>;
  } = {},
) {
  const session = panelHandlers(role);
  const settings = settingsApi(role, { permissions });
  const robots = robotsApi(role, { robots: CLIENTS_PAGE_ROBOTS });
  const clients = clientsApi({ replies });
  const live = liveSocket();
  // Later handlers win: the clients API replaces the /clients and /sites of the others.
  server.use(...session.handlers);
  server.use(...robots.handlers);
  server.use(...settings.handlers);
  server.use(...clients.handlers, live.handler);
  setLocation(path);
  const rendered = renderWithSession(
    <PanelLayout>
      <ClientsLayout>{page}</ClientsLayout>
    </PanelLayout>,
  );
  return { ...rendered, session, settings, robots, clients, live };
}
