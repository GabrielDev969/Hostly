import { getPrisma, stopTestDatabase } from './helpers/test-database';
import { resetPairingLimits } from './helpers/pairing-limits';
import { setupFleet, type Fleet } from './helpers/fleet';

interface History {
  from: string;
  to: string;
  bucketMinutes: number;
  points: {
    at: string;
    battery: number | null;
    charging: boolean | null;
    mode: string;
    samples: number;
  }[];
}

const HOUR = 60 * 60 * 1000;

describe('Robot telemetry history (e2e)', () => {
  let fleet: Fleet;
  let robotId: string;
  let quietRobotId: string;

  const history = (user: Parameters<Fleet['as']>[0], id: string, query = '') =>
    fleet.as(user).get(`/api/v1/robots/${id}/telemetry${query}`);

  beforeAll(async () => {
    fleet = await setupFleet();
    await resetPairingLimits();
    robotId = (await fleet.pair('LB-HIST-0001', fleet.siteB)).robotId;
    quietRobotId = (await fleet.pair('LB-HIST-0002', fleet.siteB)).robotId;

    // The robot is with client B now; it spent the morning with client A. Each row keeps the client it happened in.
    const { organizationId } = await getPrisma().robot.findUniqueOrThrow({
      where: { id: robotId },
    });
    const now = Date.now();
    const row = (clientId: string, agoMs: number, battery: number) => ({
      organizationId,
      clientId,
      robotId,
      ts: new Date(now - agoMs),
      battery,
      charging: false,
      mode: 'cruise' as const,
      emergency: false,
    });
    await getPrisma().telemetrySnapshot.createMany({
      data: [
        row(fleet.clientA, 25 * HOUR, 99),
        row(fleet.clientA, 3 * HOUR, 90),
        row(fleet.clientB, 1 * HOUR, 40),
      ],
    });
  });

  afterAll(async () => {
    await fleet.app.close();
    await stopTestDatabase();
  });

  it('gives the operator the last 24 hours in 5-minute buckets, of every client', async () => {
    const res = await history('operator', robotId).expect(200);
    const body = res.body as History;

    expect(body.bucketMinutes).toBe(5);
    expect(new Date(body.to).getTime() - new Date(body.from).getTime()).toBe(24 * HOUR);
    expect(new Date(body.to).getTime()).toBeGreaterThan(Date.now());
    expect(body.points.map((p) => p.battery)).toEqual([90, 40]);
    expect(body.points[0]).toMatchObject({ charging: false, mode: 'cruise', samples: 1 });
  });

  it('narrows the window with hours', async () => {
    const body = (await history('operator', robotId, '?hours=2').expect(200)).body as History;

    expect(body.points.map((p) => p.battery)).toEqual([40]);
  });

  it('shows a client user only the time the robot was theirs', async () => {
    const body = (await history('clientB', robotId).expect(200)).body as History;

    expect(body.points.map((p) => p.battery)).toEqual([40]);
  });

  it('answers 404 to the client the robot left and 403 to the advertiser', async () => {
    await history('clientA', robotId).expect(404);
    await history('advertiserA', robotId).expect(403);
  });

  it('refuses hours outside 1 to 24', async () => {
    for (const hours of ['0', '25', 'abc', '1.5']) {
      await history('operator', robotId, `?hours=${hours}`).expect(400);
    }
  });

  it('gives no points to a robot without telemetry and 404 to an unknown robot', async () => {
    const body = (await history('operator', quietRobotId).expect(200)).body as History;
    expect(body.points).toEqual([]);

    await history('operator', '99999999-9999-4999-8999-999999999999').expect(404);
  });
});
