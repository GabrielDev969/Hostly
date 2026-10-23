import { randomBytes } from 'crypto';
import type { Socket } from 'net';
import WebSocket from 'ws';
import { CONTRACT_VERSION, ROBOT_SOCKET_CLOSE } from '@hostly/contracts';
import { RobotAuthService } from '../src/modules/robots/services/robot-auth.service';
import { getPrisma, stopTestDatabase } from './helpers/test-database';
import { resetPairingLimits } from './helpers/pairing-limits';
import { captureOutput, openLive, setupFleet, waitFor, type Fleet } from './helpers/fleet';
import type { PairedRobot } from '../scripts/fake-robot/pairing';
import {
  connectRobot,
  socketUrl,
  SocketRefusedError,
  type RobotLink,
} from '../scripts/fake-robot/socket';

const TELEMETRY = {
  battery: 87,
  charging: true,
  pose: { x: 12.5, y: -3.25, theta: 1.5 },
  mode: 'cruise' as const,
  nowPlaying: { assetId: 'c4d5e6f7-a8b9-4c0d-9e1f-2a3b4c5d6e7f' },
  emergency: false,
};

// Status of a refused handshake; the URL and headers are given as the caller wants them.
function refusal(url: string, headers: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers });
    socket.once('unexpected-response', (_req, res) => {
      resolve(res.statusCode ?? 0);
      socket.terminate();
    });
    socket.once('open', () => {
      socket.terminate();
      reject(new Error('socket opened'));
    });
    socket.on('error', reject);
  });
}

describe('Robot socket (e2e)', () => {
  let fleet: Fleet;
  const output = captureOutput();
  const secrets: string[] = [];
  const links: RobotLink[] = [];
  let serials = 0;

  const robotRow = (id: string) => getPrisma().robot.findUniqueOrThrow({ where: { id } });

  const pair = async (siteId = fleet.siteA): Promise<PairedRobot & { serial: string }> => {
    serials += 1;
    const serial = `LB-LINK-${String(serials).padStart(4, '0')}`;
    const robot = await fleet.pair(serial, siteId);
    secrets.push(robot.deviceToken);
    return { ...robot, serial };
  };

  const connect = async (
    robot: PairedRobot & { serial: string },
    options: { hello?: boolean; serial?: string } = {},
  ): Promise<RobotLink> => {
    const link = await connectRobot({
      api: fleet.api,
      deviceToken: robot.deviceToken,
      serial: options.serial ?? robot.serial,
      hello: options.hello,
    });
    links.push(link);
    return link;
  };

  const online = (id: string) => robotRow(id).then((row) => row.online);

  beforeAll(async () => {
    fleet = await setupFleet(output.stream);
  });

  beforeEach(async () => {
    await resetPairingLimits();
  });

  afterEach(async () => {
    const open = links.splice(0);
    for (const link of open) link.close();
    await Promise.all(open.map((link) => link.closed));
  });

  afterAll(async () => {
    output.restore();
    await fleet.app.close();
    await stopTestDatabase();
  });

  describe('presence and telemetry', () => {
    it('goes online on hello, records telemetry and goes offline when the socket closes', async () => {
      const robot = await pair();
      const link = await connect(robot);

      const row = await waitFor(
        () => robotRow(robot.robotId).then((r) => (r.online ? r : null)),
        'robot online',
      );
      expect(row).toMatchObject({
        appVersion: '0.1.0-fake',
        romVersion: 'fake-rom-1',
        manifestVersion: null,
      });
      expect(row.lastSeenAt).not.toBeNull();

      link.sendTelemetry(TELEMETRY);
      const snapshot = await waitFor(
        () => getPrisma().telemetrySnapshot.findFirst({ where: { robotId: robot.robotId } }),
        'telemetry snapshot',
      );
      expect(snapshot).toMatchObject({
        organizationId: row.organizationId,
        clientId: fleet.clientA,
        battery: 87,
        charging: true,
        poseX: 12.5,
        poseY: -3.25,
        poseTheta: 1.5,
        mode: 'cruise',
        emergency: false,
      });

      const res = await fleet.as('operator').get(`/api/v1/robots/${robot.robotId}`).expect(200);
      expect(res.body).toMatchObject({
        online: true,
        appVersion: '0.1.0-fake',
        telemetry: {
          battery: 87,
          charging: true,
          pose: { x: 12.5, y: -3.25, theta: 1.5 },
          mode: 'cruise',
          nowPlaying: TELEMETRY.nowPlaying,
          emergency: false,
        },
      });

      link.close();
      await expect(link.closed).resolves.toMatchObject({ code: 1000 });
      await waitFor(async () => !(await online(robot.robotId)), 'robot offline after close');
    });

    it('goes offline after three pings without a pong', async () => {
      const robot = await pair();
      const link = await connect(robot);
      await waitFor(() => online(robot.robotId), 'robot online');
      // The heartbeat runs: a ping arrives and its pong keeps lastSeenAt fresh.
      await waitFor(() => link.received.some((m) => m.type === 'ping'), 'first ping');

      const vanishedAt = Date.now();
      link.vanish();
      const closed = await link.closed;
      // Two intervals at least: the cloud waits for the missed pings (1 s each in the e2e) before giving up.
      expect(Date.now() - vanishedAt).toBeGreaterThanOrEqual(2_000);
      expect(closed.code).toBe(1006);
      await waitFor(async () => !(await online(robot.robotId)), 'robot offline after pings');
    });

    it('keeps the history with the client where it happened when the robot moves', async () => {
      const robot = await pair();
      const link = await connect(robot);
      await waitFor(() => online(robot.robotId), 'robot online');

      link.sendTelemetry();
      await waitFor(
        () => getPrisma().telemetrySnapshot.count({ where: { robotId: robot.robotId } }),
        'first snapshot',
      );
      await fleet
        .as('operator')
        .post(`/api/v1/robots/${robot.robotId}/move`, { siteId: fleet.siteB })
        .expect(200);
      link.sendTelemetry();
      await waitFor(
        async () =>
          (await getPrisma().telemetrySnapshot.count({ where: { robotId: robot.robotId } })) === 2,
        'second snapshot',
      );

      const history = await getPrisma().telemetrySnapshot.findMany({
        where: { robotId: robot.robotId },
        orderBy: { ts: 'asc' },
      });
      expect(history.map((row) => row.clientId)).toEqual([fleet.clientA, fleet.clientB]);
      await expect(robotRow(robot.robotId)).resolves.toMatchObject({ clientId: fleet.clientB });
    });

    it('marks a robot left online by a restart offline once its lastSeenAt is stale', async () => {
      const robot = await pair();
      await getPrisma().robot.update({
        where: { id: robot.robotId },
        data: { online: true, lastSeenAt: new Date(Date.now() - 60 * 60 * 1000) },
      });

      await waitFor(async () => !(await online(robot.robotId)), 'stale robot swept offline');
    });
  });

  describe('handshake', () => {
    it('refuses the upgrade with 401 without a valid token in the Authorization header', async () => {
      const robot = await pair();
      const url = socketUrl(fleet.api);

      expect(new URL(url).search).toBe('');
      await expect(refusal(url)).resolves.toBe(401);
      await expect(refusal(url, { authorization: 'Bearer not-a-real-token' })).resolves.toBe(401);
      await expect(refusal(url, { authorization: robot.deviceToken })).resolves.toBe(401);
      // A token in the URL is never read.
      await expect(refusal(`${url}?token=${robot.deviceToken}`)).resolves.toBe(401);
    });

    it('refuses a revoked token and a token replaced by a new pairing', async () => {
      const revoked = await pair();
      await fleet.as('operator').post(`/api/v1/robots/${revoked.robotId}/revoke`).expect(200);
      await expect(connect(revoked)).rejects.toEqual(new SocketRefusedError(401));

      const first = await pair();
      const second = await fleet.pair(first.serial, fleet.siteA);
      secrets.push(second.deviceToken);
      await expect(connect(first)).rejects.toEqual(new SocketRefusedError(401));
      await expect(connect({ ...second, serial: first.serial })).resolves.toBeDefined();
    });
  });

  describe('closing rules', () => {
    it('closes an open socket at once when the robot is revoked', async () => {
      const robot = await pair();
      const link = await connect(robot);
      await waitFor(() => online(robot.robotId), 'robot online');

      await fleet.as('operator').post(`/api/v1/robots/${robot.robotId}/revoke`).expect(200);

      await expect(link.closed).resolves.toMatchObject({ code: ROBOT_SOCKET_CLOSE.unauthorized });
      await waitFor(async () => !(await online(robot.robotId)), 'revoked robot offline');
    });

    it('closes the socket of the old token when the robot is paired again', async () => {
      const robot = await pair();
      const link = await connect(robot);
      await waitFor(() => online(robot.robotId), 'robot online');

      const again = await fleet.pair(robot.serial, fleet.siteA);
      secrets.push(again.deviceToken);

      await expect(link.closed).resolves.toMatchObject({ code: ROBOT_SOCKET_CLOSE.unauthorized });
    });

    it('closes when the hello names another serial', async () => {
      const robot = await pair();
      const link = await connect(robot, { serial: 'LB-SOMEONE-ELSE' });
      await expect(link.closed).resolves.toMatchObject({
        code: ROBOT_SOCKET_CLOSE.serialMismatch,
      });
      expect(await online(robot.robotId)).toBe(false);
    });

    it('closes when no hello arrives in time and ignores messages sent before it', async () => {
      const robot = await pair();
      const link = await connect(robot, { hello: false });
      link.sendTelemetry();

      await expect(link.closed).resolves.toMatchObject({ code: ROBOT_SOCKET_CLOSE.helloTimeout });
      expect(await getPrisma().telemetrySnapshot.count({ where: { robotId: robot.robotId } })).toBe(
        0,
      );
      expect(await online(robot.robotId)).toBe(false);
    });

    it('closes when the robot speaks another contract version', async () => {
      const robot = await pair();
      const link = await connect(robot, { hello: false });
      link.sendHello({ contractVersion: 2 });
      await expect(link.closed).resolves.toMatchObject({
        code: ROBOT_SOCKET_CLOSE.contractMismatch,
      });
    });

    it('keeps the connection on broken or unknown messages', async () => {
      const robot = await pair();
      const link = await connect(robot);
      await waitFor(() => online(robot.robotId), 'robot online');

      link.sendRaw('not json');
      link.sendRaw(
        JSON.stringify({ type: 'battery.health', sentAt: new Date().toISOString(), payload: {} }),
      );
      link.sendRaw(
        JSON.stringify({ type: 'y'.repeat(500), sentAt: new Date().toISOString(), payload: {} }),
      );
      link.sendRaw(
        JSON.stringify({
          type: 'telemetry',
          sentAt: new Date().toISOString(),
          payload: { battery: 500 },
        }),
      );
      link.sendTelemetry();

      await waitFor(
        () => getPrisma().telemetrySnapshot.count({ where: { robotId: robot.robotId } }),
        'valid telemetry after broken ones',
      );
      // An unknown type is logged cut short.
      await waitFor(() => output.text().includes('y'.repeat(64)), 'unknown type in the log');
      expect(output.text()).not.toContain('y'.repeat(65));
      expect(await online(robot.robotId)).toBe(true);
    });

    it('lets a second connection of the robot replace the first without going offline', async () => {
      const robot = await pair();
      const live = await openLive(fleet.api, await fleet.ticket('operator'));
      const first = await connect(robot);
      await waitFor(() => online(robot.robotId), 'robot online');

      const second = await connect(robot);
      await expect(first.closed).resolves.toMatchObject({ code: ROBOT_SOCKET_CLOSE.replaced });
      second.sendTelemetry();

      // Writes of one robot are ordered: an offline from the first socket would arrive before this telemetry.
      await waitFor(
        () =>
          live.events.some(
            (e) => e.type === 'robot.telemetry' && e.payload.robotId === robot.robotId,
          ),
        'telemetry of the second connection',
      );
      expect(
        live.events.filter(
          (e) => e.type === 'robot.offline' && e.payload.robotId === robot.robotId,
        ),
      ).toEqual([]);
      expect(await online(robot.robotId)).toBe(true);
      live.close();
    });

    it('closes on a burst of messages and on a message too large', async () => {
      const robot = await pair();
      const burst = await connect(robot);
      for (let i = 0; i < 25; i += 1) burst.sendRaw('{}');
      await expect(burst.closed).resolves.toMatchObject({ code: ROBOT_SOCKET_CLOSE.rateLimited });

      const big = await connect(robot);
      big.sendRaw('x'.repeat(20_000));
      await expect(big.closed).resolves.toMatchObject({ code: 1009 });
    });
  });

  describe('stale sockets and handshake abuse', () => {
    it('ignores a hello sent by a socket the cloud is closing and keeps the legitimate connection', async () => {
      const robot = await pair();
      const old = new WebSocket(socketUrl(fleet.api), {
        headers: { authorization: `Bearer ${robot.deviceToken}` },
      });
      await new Promise((resolve, reject) => {
        old.once('open', resolve);
        old.once('error', reject);
      });
      // The old client stops reading: it never sees the cloud's close frame, so its side stays open.
      const transport = (old as unknown as { _socket: Socket })._socket;
      transport.pause();

      const again = await fleet.pair(robot.serial, fleet.siteA);
      secrets.push(again.deviceToken);
      const current = await connect({ ...again, serial: robot.serial });
      let currentClosed = false;
      void current.closed.then(() => (currentClosed = true));
      await waitFor(() => online(robot.robotId), 'robot online with the new token');

      const oldClosed = new Promise((resolve) => old.once('close', resolve));
      old.send(
        JSON.stringify({
          type: 'hello',
          sentAt: new Date().toISOString(),
          payload: {
            serial: robot.serial,
            appVersion: 'old',
            romVersion: 'old',
            manifestVersion: null,
            contractVersion: CONTRACT_VERSION,
          },
        }),
      );
      transport.resume();
      await oldClosed;

      // A full ping round after the old socket is gone: the current one is still the robot's connection.
      const pings = current.received.filter((m) => m.type === 'ping').length;
      await waitFor(
        () => current.received.filter((m) => m.type === 'ping').length > pings,
        'a ping after the old socket closed',
      );
      expect(currentClosed).toBe(false);
      await expect(robotRow(robot.robotId)).resolves.toMatchObject({
        online: true,
        appVersion: '0.1.0-fake',
      });
    });

    it('lets at most two sockets of a robot wait for their hello', async () => {
      const robot = await pair();
      await connect(robot, { hello: false });
      await connect(robot, { hello: false });
      const third = await connect(robot, { hello: false });

      await expect(third.closed).resolves.toMatchObject({ code: ROBOT_SOCKET_CLOSE.rateLimited });
    });

    // Last in the suite: it leaves 127.0.0.1 blocked for the rest of the window.
    it('refuses a burst of bad handshakes without asking the database', async () => {
      const robot = await pair();
      const lookups = jest.spyOn(fleet.app.get(RobotAuthService), 'authenticateHash');
      const url = socketUrl(fleet.api);

      await expect(refusal(url, { authorization: 'Bearer not-hex' })).resolves.toBe(401);
      expect(lookups).not.toHaveBeenCalled();

      const statuses: number[] = [];
      for (let i = 0; i < 30; i += 1) {
        const token = randomBytes(32).toString('hex');
        statuses.push(await refusal(url, { authorization: `Bearer ${token}` }));
      }
      const firstBlocked = statuses.indexOf(429);
      expect(firstBlocked).toBeGreaterThan(0);
      expect(statuses.slice(0, firstBlocked).every((status) => status === 401)).toBe(true);
      expect(statuses.slice(firstBlocked).every((status) => status === 429)).toBe(true);
      expect(lookups).toHaveBeenCalledTimes(firstBlocked);

      // Blocked means blocked, even with a valid token, until the window ends.
      await expect(connect(robot)).rejects.toEqual(new SocketRefusedError(429));
      expect(lookups).toHaveBeenCalledTimes(firstBlocked);
      lookups.mockRestore();
    });
  });

  it('never writes a device token to the logs, pino included', () => {
    const printed = output.text();
    // The capture really holds the app's pino output: socket logs and HTTP request logs.
    expect(printed).toContain('"msg":"Robot socket closed"');
    expect(printed).toContain('"msg":"Robot socket refused"');
    expect(printed).toMatch(/"msg":"POST \/api\/v1\/\S+ 20\d \d+ms"/);
    expect(secrets.length).toBeGreaterThan(5);
    for (const secret of secrets) expect(printed).not.toContain(secret);
  });
});
