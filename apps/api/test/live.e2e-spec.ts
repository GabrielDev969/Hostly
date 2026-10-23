import Redis from 'ioredis';
import { LIVE_SOCKET_CLOSE, LIVE_SOCKET_PATH, type LiveEvent } from '@hostly/contracts';
import { CryptoUtil } from '../src/shared/utils/crypto.util';
import { LIVE_TICKET_PREFIX } from '../src/modules/live/services/live-ticket-store';
import { getPrisma, stopTestDatabase } from './helpers/test-database';
import { resetPairingLimits } from './helpers/pairing-limits';
import {
  captureOutput,
  openLive,
  setupFleet,
  waitFor,
  type Fleet,
  type LiveClient,
} from './helpers/fleet';
import type { PairedRobot } from '../scripts/fake-robot/pairing';
import { connectRobot, type RobotLink } from '../scripts/fake-robot/socket';

type Robot = PairedRobot & { serial: string };

const of = (client: LiveClient, robotId: string, type?: LiveEvent['type']) =>
  client.events.filter(
    (event) => event.payload.robotId === robotId && (type === undefined || event.type === type),
  );

describe('Live channel for the panel (e2e)', () => {
  let fleet: Fleet;
  let redis: Redis;
  const output = captureOutput();
  const secrets: string[] = [];
  const clients: LiveClient[] = [];
  const links: RobotLink[] = [];
  let serials = 0;

  const ticket = async (user: Parameters<Fleet['ticket']>[0]) => {
    const value = await fleet.ticket(user);
    secrets.push(value);
    return value;
  };

  const watch = async (user: Parameters<Fleet['ticket']>[0]) => {
    const client = await openLive(fleet.api, await ticket(user));
    clients.push(client);
    return client;
  };

  const pair = async (siteId: string): Promise<Robot> => {
    serials += 1;
    const serial = `LB-LIVE-${String(serials).padStart(4, '0')}`;
    const robot = await fleet.pair(serial, siteId);
    secrets.push(robot.deviceToken);
    return { ...robot, serial };
  };

  const connect = async (robot: Robot) => {
    const link = await connectRobot({
      api: fleet.api,
      deviceToken: robot.deviceToken,
      serial: robot.serial,
    });
    links.push(link);
    return link;
  };

  const refused = (promise: Promise<LiveClient>) =>
    promise.then(
      () => 'opened',
      (error: Error) => error.message,
    );

  beforeAll(async () => {
    fleet = await setupFleet();
    redis = new Redis({ host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) });
  });

  beforeEach(async () => {
    await resetPairingLimits();
  });

  afterEach(async () => {
    const open = links.splice(0);
    for (const link of open) link.close();
    await Promise.all(open.map((link) => link.closed));
    for (const client of clients.splice(0)) client.close();
  });

  afterAll(async () => {
    output.restore();
    await redis?.quit();
    await fleet.app.close();
    await stopTestDatabase();
  });

  it('sends the operator online, telemetry and offline of its robots', async () => {
    const operator = await watch('operator');
    const robot = await pair(fleet.siteA);
    const link = await connect(robot);

    await waitFor(() => of(operator, robot.robotId, 'robot.online').length, 'robot.online');
    link.sendTelemetry();
    await waitFor(() => of(operator, robot.robotId, 'robot.telemetry').length, 'robot.telemetry');
    expect(of(operator, robot.robotId, 'robot.telemetry')[0]).toMatchObject({
      payload: { robotId: robot.robotId, telemetry: { mode: 'cruise', emergency: false } },
    });

    link.close();
    await waitFor(() => of(operator, robot.robotId, 'robot.offline').length, 'robot.offline');
    expect(of(operator, robot.robotId).map((event) => event.type)).toEqual([
      'robot.online',
      'robot.telemetry',
      'robot.offline',
    ]);
  });

  it('sends a client user only the robots of their client', async () => {
    const operator = await watch('operator');
    const clientA = await watch('clientA');
    const inA = await pair(fleet.siteA);
    const inB = await pair(fleet.siteB);
    const linkB = await connect(inB);
    const linkA = await connect(inA);
    await waitFor(() => of(operator, inA.robotId, 'robot.online').length, 'robot A online');

    linkB.sendTelemetry();
    await waitFor(() => of(operator, inB.robotId, 'robot.telemetry').length, 'telemetry of B');
    // Events reach every socket in the order they were broadcast: once A's arrives, B's would have too.
    linkA.sendTelemetry();
    await waitFor(() => of(clientA, inA.robotId, 'robot.telemetry').length, 'telemetry of A');

    expect(of(clientA, inB.robotId)).toEqual([]);
    expect(of(clientA, inA.robotId, 'robot.online')).toHaveLength(1);
  });

  it('stops sending a moved robot to its former client', async () => {
    const clientA = await watch('clientA');
    const clientB = await watch('clientB');
    const moving = await pair(fleet.siteA);
    const marker = await pair(fleet.siteA);
    const link = await connect(moving);
    const markerLink = await connect(marker);

    link.sendTelemetry();
    await waitFor(() => of(clientA, moving.robotId, 'robot.telemetry').length, 'telemetry in A');

    await fleet
      .as('operator')
      .post(`/api/v1/robots/${moving.robotId}/move`, { siteId: fleet.siteB })
      .expect(200);
    link.sendTelemetry();
    await waitFor(() => of(clientB, moving.robotId, 'robot.telemetry').length, 'telemetry in B');
    markerLink.sendTelemetry();
    await waitFor(() => of(clientA, marker.robotId, 'robot.telemetry').length, 'marker in A');

    expect(of(clientA, moving.robotId, 'robot.telemetry')).toHaveLength(1);
  });

  it('sends robot.online again when telemetry arrives after a stale sweep marked it offline', async () => {
    const operator = await watch('operator');
    const robot = await pair(fleet.siteA);
    const link = await connect(robot);
    await waitFor(() => of(operator, robot.robotId, 'robot.online').length, 'robot.online');

    // No pong refreshes lastSeenAt while the sweep runs.
    link.vanish();
    await getPrisma().robot.update({
      where: { id: robot.robotId },
      data: { lastSeenAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    // Required here: the use case reads env.config, which must load after the test database is up.
    const { SweepStaleRobotsUseCase } =
      require('../src/modules/robot-link/use-cases/sweep-stale-robots.use-case') as typeof import('../src/modules/robot-link/use-cases/sweep-stale-robots.use-case');
    await fleet.app.get(SweepStaleRobotsUseCase).execute();
    await waitFor(() => of(operator, robot.robotId, 'robot.offline').length, 'swept offline');

    link.reappear();
    link.sendTelemetry();
    await waitFor(() => of(operator, robot.robotId, 'robot.online').length === 2, 'online again');
    expect(of(operator, robot.robotId).map((event) => event.type)).toEqual([
      'robot.online',
      'robot.offline',
      'robot.online',
      'robot.telemetry',
    ]);
  });

  describe('tickets', () => {
    it('gives no ticket to an advertiser', async () => {
      await fleet.as('advertiserA').post('/api/v1/live/tickets').expect(403);
    });

    it('opens one socket per ticket and refuses a used or expired one', async () => {
      const once = await ticket('clientA');
      const client = await openLive(fleet.api, once);
      clients.push(client);
      await expect(refused(openLive(fleet.api, once))).resolves.toBe('HTTP 401');

      const late = await ticket('clientA');
      await waitFor(
        async () =>
          (await redis.exists(`${LIVE_TICKET_PREFIX}${CryptoUtil.hashToken(late)}`)) === 0,
        'ticket expiry',
      );
      await expect(refused(openLive(fleet.api, late))).resolves.toBe('HTTP 401');
    });

    it('refuses a socket without a ticket, with an unknown one or with the ticket in the URL', async () => {
      await expect(refused(openLive(fleet.api, null))).resolves.toBe('HTTP 401');
      await expect(refused(openLive(fleet.api, 'f'.repeat(64)))).resolves.toBe('HTTP 401');
      const inUrl = await ticket('operator');
      const url = `${fleet.api.replace(/^http/, 'ws')}${LIVE_SOCKET_PATH}?ticket=${inUrl}`;
      await expect(refused(openLive(fleet.api, null, { url }))).resolves.toBe('HTTP 401');
    });

    it('refuses an Origin outside CORS_ORIGINS and a missing one', async () => {
      await expect(
        refused(openLive(fleet.api, await ticket('operator'), { origin: 'http://evil.example' })),
      ).resolves.toBe('HTTP 403');
      await expect(
        refused(openLive(fleet.api, await ticket('operator'), { origin: null })),
      ).resolves.toBe('HTTP 403');
    });

    it('closes the socket at the end of its lifetime', async () => {
      const client = await watch('operator');
      await expect(client.closed).resolves.toBe(LIVE_SOCKET_CLOSE.expired);
    });
  });

  it('never writes a ticket or a device token to the logs', () => {
    const printed = output.text();
    expect(secrets.length).toBeGreaterThan(5);
    for (const secret of secrets) expect(printed).not.toContain(secret);
  });
});
