import { LIVE_SOCKET_PATH, type LiveEvent, type TelemetryPayload } from '@hostly/contracts';
import { http, HttpResponse, ws, type WebSocketHandlerConnection } from 'msw';
import type { Schemas } from '@/lib/api/client';
import { CLIENT_A, CLIENT_B, membershipFor, type RoleName } from './fixtures';
import { ACCESS_TOKEN } from './handlers';
import { API } from './server';

type Robot = Schemas['RobotResponseDto'];
type Site = Schemas['SiteResponseDto'];

export const SITE_A = '66666666-6666-4666-8666-666666666666';
export const SITE_B = '77777777-7777-4777-8777-777777777777';
export const ROBOT_A = '88888888-8888-4888-8888-888888888888';
export const ROBOT_B = '99999999-9999-4999-8999-999999999999';

// Older than any event a test sends, so the panel never drops those as stale.
const PAST = '2026-01-01T12:00:00.000Z';

export const SITES: Site[] = [
  { id: SITE_A, clientId: CLIENT_A, name: 'Alfa - Piso L1' },
  { id: SITE_B, clientId: CLIENT_B, name: 'Beta - Piso L2' },
].map((site) => ({
  ...site,
  timezone: 'America/Sao_Paulo',
  address: null,
  createdAt: PAST,
  updatedAt: PAST,
}));

export function robotFixture(over: Partial<Robot> = {}): Robot {
  return {
    id: ROBOT_A,
    serial: 'LB0000000001',
    model: 'luckibot_plus',
    name: 'Robô Alfa',
    clientId: CLIENT_A,
    siteId: SITE_A,
    status: 'active',
    romVersion: 'V10.3',
    appVersion: '1.0.0',
    manifestVersion: null,
    online: true,
    lastSeenAt: PAST,
    telemetry: {
      at: PAST,
      battery: 80,
      charging: false,
      pose: { x: 1.5, y: -2.25, theta: Math.PI / 2 },
      mode: 'cruise',
      nowPlaying: null,
      emergency: false,
    },
    createdAt: PAST,
    updatedAt: PAST,
    ...over,
  };
}

export const ROBOTS: Robot[] = [
  robotFixture(),
  robotFixture({
    id: ROBOT_B,
    serial: 'LB0000000002',
    name: 'Robô Beta',
    clientId: CLIENT_B,
    siteId: SITE_B,
    online: false,
    appVersion: '0.9.0',
    telemetry: null,
  }),
];

export function historyFixture(points: Schemas['RobotTelemetryPointDto'][] = []) {
  const to = Date.parse('2026-10-23T12:10:00.000Z');
  return {
    from: new Date(to - 24 * 60 * 60 * 1000).toISOString(),
    to: new Date(to).toISOString(),
    bucketMinutes: 5,
    points,
  };
}

export function point(
  at: string,
  battery: number | null,
  over: Partial<Schemas['RobotTelemetryPointDto']> = {},
) {
  return { at, battery, charging: false, mode: 'cruise' as const, samples: 30, ...over };
}

export interface RobotsApiCalls {
  list: URL[];
  tickets: number;
  renames: unknown[];
  moves: unknown[];
  revokes: number;
}

type Reply = { status: number } | undefined;

// The robots API as the role sees it: a client user only reaches its own client's robots and sites.
export function robotsApi(
  role: RoleName,
  options: {
    robots?: Robot[];
    history?: ReturnType<typeof historyFixture>;
    // Statuses the next ticket requests answer with, in order; then 201.
    tickets?: number[];
  } = {},
) {
  const robots = structuredClone(options.robots ?? ROBOTS);
  const calls: RobotsApiCalls = { list: [], tickets: 0, renames: [], moves: [], revokes: 0 };
  const fail: { next: Reply } = { next: undefined };
  const ticketReplies = [...(options.tickets ?? [])];
  const scope = membershipFor(role).scope;
  const visible = (clientId: string) => scope.kind === 'operator' || scope.clientId === clientId;
  const authorized = (request: Request) =>
    request.headers.get('authorization') === `Bearer ${ACCESS_TOKEN}`;
  const error = (status: number) =>
    HttpResponse.json({ statusCode: status, message: `HTTP ${status}` }, { status });
  const find = (id: unknown) => robots.find((robot) => robot.id === id && visible(robot.clientId));
  const failing = () => {
    const reply = fail.next;
    fail.next = undefined;
    return reply ? error(reply.status) : null;
  };

  const handlers = [
    http.get(`${API}/api/v1/robots`, ({ request }) => {
      if (!authorized(request)) return error(401);
      const url = new URL(request.url);
      calls.list.push(url);
      const clientId = url.searchParams.get('clientId');
      return HttpResponse.json(
        robots.filter((r) => visible(r.clientId) && (!clientId || r.clientId === clientId)),
      );
    }),
    http.get(`${API}/api/v1/robots/:id/telemetry`, ({ request, params }) => {
      if (!authorized(request)) return error(401);
      if (!find(params.id)) return error(404);
      return HttpResponse.json(options.history ?? historyFixture());
    }),
    http.get(`${API}/api/v1/robots/:id`, ({ request, params }) => {
      if (!authorized(request)) return error(401);
      const robot = find(params.id);
      return robot ? HttpResponse.json(robot) : error(404);
    }),
    http.patch(`${API}/api/v1/robots/:id`, async ({ request, params }) => {
      const body = (await request.json()) as { name: string };
      calls.renames.push(body);
      const refused = failing();
      if (refused) return refused;
      const robot = find(params.id);
      if (!robot) return error(404);
      robot.name = body.name;
      return HttpResponse.json(robot);
    }),
    http.post(`${API}/api/v1/robots/:id/move`, async ({ request, params }) => {
      const body = (await request.json()) as { siteId: string };
      calls.moves.push(body);
      const refused = failing();
      if (refused) return refused;
      const robot = find(params.id);
      const site = SITES.find((s) => s.id === body.siteId);
      if (!robot || !site) return error(404);
      Object.assign(robot, { siteId: site.id, clientId: site.clientId });
      return HttpResponse.json(robot);
    }),
    http.post(`${API}/api/v1/robots/:id/revoke`, ({ params }) => {
      calls.revokes += 1;
      const refused = failing();
      if (refused) return refused;
      const robot = find(params.id);
      if (!robot) return error(404);
      Object.assign(robot, { status: 'revoked', online: false });
      return HttpResponse.json(robot);
    }),
    http.get(`${API}/api/v1/sites`, ({ request }) => {
      if (!authorized(request)) return error(401);
      return HttpResponse.json(SITES.filter((site) => visible(site.clientId)));
    }),
    http.post(`${API}/api/v1/live/tickets`, ({ request }) => {
      if (!authorized(request)) return error(401);
      calls.tickets += 1;
      const status = ticketReplies.shift();
      if (status) return error(status);
      return HttpResponse.json(
        {
          ticket: calls.tickets.toString(16).padStart(64, '0'),
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
        },
        { status: 201 },
      );
    }),
  ];
  return { handlers, calls, robots, fail };
}

export interface LiveConnectionRecord {
  client: WebSocketHandlerConnection['client'];
  url: string;
  protocols: string[];
  closed: boolean;
}

// One link for every test: each one opens a BroadcastChannel listener in MSW.
const link = ws.link(`${API.replace(/^http/, 'ws')}${LIVE_SOCKET_PATH}`);

// The panel's live socket at the API. Tests push events and close it from the server side.
export function liveSocket() {
  const connections: LiveConnectionRecord[] = [];
  const handler = link.addEventListener('connection', ({ client, info }) => {
    const record: LiveConnectionRecord = {
      client,
      url: client.url.href,
      protocols: [info.protocols ?? []].flat(),
      closed: false,
    };
    client.addEventListener('close', () => {
      record.closed = true;
    });
    connections.push(record);
  });
  const current = () => {
    const open = connections.filter((c) => !c.closed);
    if (open.length !== 1) throw new Error(`Expected one open live socket, found ${open.length}`);
    return open[0]!;
  };
  return {
    handler,
    connections,
    open: () => connections.filter((c) => !c.closed),
    send: (event: LiveEvent | string) =>
      current().client.send(typeof event === 'string' ? event : JSON.stringify(event)),
    close: (code: number) => current().client.close(code),
  };
}

export function telemetryEvent(
  robotId: string,
  battery: number | null,
  over: Partial<TelemetryPayload> = {},
  at = new Date().toISOString(),
): LiveEvent {
  return {
    type: 'robot.telemetry',
    sentAt: at,
    payload: {
      robotId,
      at,
      telemetry: {
        battery,
        charging: false,
        pose: { x: 3, y: 4, theta: 0 },
        mode: 'cruise',
        nowPlaying: null,
        emergency: false,
        ...over,
      },
    },
  };
}

export function presenceEvent(
  type: 'robot.online' | 'robot.offline',
  robotId: string,
  at = new Date().toISOString(),
): LiveEvent {
  return { type, sentAt: at, payload: { robotId, at } };
}
