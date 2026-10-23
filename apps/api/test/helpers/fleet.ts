import { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'net';
import { Writable } from 'stream';
import request from 'supertest';
import { App } from 'supertest/types';
import WebSocket from 'ws';
import {
  LIVE_SOCKET_PATH,
  LIVE_SOCKET_PROTOCOL,
  LIVE_TICKET_PROTOCOL_PREFIX,
  liveEventSchema,
  type LiveEvent,
} from '@hostly/contracts';
import { startTestDatabase, resetDatabase } from './test-database';
import { seedPermissions } from './seed-permissions';
import { registerAndVerify } from './auth-flow';
import { addScopedMember, provisionOperator } from './operator';
import {
  pairRobot,
  type DeviceTransport,
  type PairedRobot,
} from '../../scripts/fake-robot/pairing';

export const PANEL_ORIGIN = 'http://localhost:3000';
const PASSWORD = 'StrongPass@123';

const USERS = {
  operator: 'fleet-operator@example.com',
  clientA: 'fleet-client-a@example.com',
  clientB: 'fleet-client-b@example.com',
  advertiserA: 'fleet-advertiser-a@example.com',
} as const;

export type FleetUser = keyof typeof USERS;

// Polls until check returns something truthy; fails after the deadline instead of sleeping a fixed time.
export async function waitFor<T>(
  check: () => T | Promise<T>,
  what: string,
  timeoutMs = 10_000,
): Promise<NonNullable<T>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

export interface LiveClient {
  readonly events: LiveEvent[];
  readonly closed: Promise<number>;
  send(data: string): void;
  close(): void;
}

// The panel side of the live channel, as a browser opens it: ticket as a subprotocol, Origin header set.
export function openLive(
  api: string,
  ticket: string | null,
  options: { origin?: string | null; url?: string } = {},
): Promise<LiveClient> {
  const protocols = [LIVE_SOCKET_PROTOCOL];
  if (ticket) protocols.push(`${LIVE_TICKET_PROTOCOL_PREFIX}${ticket}`);
  const origin = options.origin === undefined ? PANEL_ORIGIN : options.origin;
  const socket = new WebSocket(
    options.url ?? api.replace(/^http/, 'ws') + LIVE_SOCKET_PATH,
    protocols,
    origin ? { origin } : {},
  );
  const events: LiveEvent[] = [];
  const closed = new Promise<number>((resolve) => socket.on('close', (code) => resolve(code)));
  socket.on('message', (data: Buffer) => {
    events.push(liveEventSchema.parse(JSON.parse(data.toString('utf8'))));
  });
  return new Promise((resolve, reject) => {
    socket.once('unexpected-response', (_req, res) => {
      reject(new Error(`HTTP ${res.statusCode}`));
      socket.terminate();
    });
    socket.on('error', reject);
    socket.once('open', () => {
      if (socket.protocol !== LIVE_SOCKET_PROTOCOL) reject(new Error('protocol not selected'));
      resolve({
        events,
        closed,
        send: (data) => socket.send(data),
        close: () => socket.close(1000),
      });
    });
  });
}

export interface Fleet {
  app: INestApplication;
  server: App;
  // http://127.0.0.1:<port> of the listening test app.
  api: string;
  workspaceId: string;
  clientA: string;
  clientB: string;
  siteA: string;
  siteB: string;
  as(user: FleetUser): {
    get: (path: string) => request.Test;
    post: (path: string, body?: object) => request.Test;
  };
  pair(serial: string, siteId: string): Promise<PairedRobot>;
  ticket(user: FleetUser): Promise<string>;
}

// An operator with clients A and B (one site each), a user per client, an advertiser of A, and a listening app.
export async function setupFleet(logs?: Writable): Promise<Fleet> {
  await startTestDatabase();
  const { createTestApp } = require('./test-app') as typeof import('./test-app');
  const { app, emailDispatcher } = await createTestApp({ logs });
  await app.listen(0);
  const server = app.getHttpServer() as App;
  const { port } = (app.getHttpServer() as { address(): AddressInfo }).address();

  await resetDatabase();
  await seedPermissions();
  for (const email of Object.values(USERS)) {
    await registerAndVerify(server, emailDispatcher, { email, name: email, password: PASSWORD });
  }
  const workspaceId = await provisionOperator(app, USERS.operator, { name: 'Fleet Operator' });

  const tokens = {} as Record<FleetUser, string>;
  const login = async (user: FleetUser) => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: USERS[user], password: PASSWORD })
      .expect(200);
    tokens[user] = res.body.accessToken as string;
  };
  const as = (user: FleetUser) => ({
    get: (path: string) =>
      request(server)
        .get(path)
        .set('Authorization', `Bearer ${tokens[user]}`)
        .set('x-workspace-id', workspaceId),
    post: (path: string, body: object = {}) =>
      request(server)
        .post(path)
        .set('Authorization', `Bearer ${tokens[user]}`)
        .set('x-workspace-id', workspaceId)
        .send(body),
  });

  await login('operator');
  const createClient = async (name: string) =>
    ((await as('operator').post('/api/v1/clients', { name }).expect(201)).body as { id: string })
      .id;
  const createSite = async (clientId: string, name: string) =>
    (
      (
        await as('operator')
          .post('/api/v1/sites', { clientId, name, timezone: 'America/Sao_Paulo' })
          .expect(201)
      ).body as { id: string }
    ).id;
  const clientA = await createClient('Shopping A');
  const clientB = await createClient('Shopping B');
  const siteA = await createSite(clientA, 'A - Piso L1');
  const siteB = await createSite(clientB, 'B - Piso L1');

  await addScopedMember(workspaceId, USERS.clientA, 'client_admin', {
    clientId: clientA,
    advertiserId: null,
  });
  await addScopedMember(workspaceId, USERS.clientB, 'client_admin', {
    clientId: clientB,
    advertiserId: null,
  });
  await addScopedMember(workspaceId, USERS.advertiserA, 'advertiser', {
    clientId: clientA,
    advertiserId: 'adv-1',
  });
  for (const user of ['clientA', 'clientB', 'advertiserA'] as const) await login(user);

  const device: DeviceTransport = async (path, body) => {
    const res = await request(server)
      .post(`/api/v1${path}`)
      .send(body as object);
    return { status: res.status, body: res.body as unknown };
  };

  // The fake-robot flow; the operator approves as soon as the code shows.
  const pair = (serial: string, siteId: string) =>
    pairRobot({
      transport: device,
      serial,
      pollIntervalMs: 1_050,
      onCode: async ({ code }) => {
        await as('operator').post('/api/v1/robots/pairings/approve', { code, siteId }).expect(201);
      },
    });

  const ticket = async (user: FleetUser) =>
    ((await as(user).post('/api/v1/live/tickets').expect(201)).body as { ticket: string }).ticket;

  return {
    app,
    server,
    api: `http://127.0.0.1:${port}`,
    workspaceId,
    clientA,
    clientB,
    siteA,
    siteB,
    as,
    pair,
    ticket,
  };
}

// Everything the app logs (pino, at trace level, through the app's own config) and prints while a suite runs,
// to prove no secret reaches the logs.
export function captureOutput(): { stream: Writable; text: () => string; restore: () => void } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString('utf8'));
      callback();
    },
  });
  const spies = [process.stdout, process.stderr].map((out) => {
    const write = out.write.bind(out) as (...args: unknown[]) => boolean;
    return jest.spyOn(out, 'write').mockImplementation((...args: unknown[]) => {
      chunks.push(String(args[0]));
      return write(...args);
    });
  });
  return {
    stream,
    text: () => chunks.join(''),
    restore: () => spies.forEach((spy) => spy.mockRestore()),
  };
}
