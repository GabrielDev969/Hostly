import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createHash, randomUUID } from 'crypto';
import {
  pairPollResponseSchema,
  pairStartResponseSchema,
  type PairPollResponse,
  type PairStartResponse,
} from '@hostly/contracts';
import {
  startTestDatabase,
  stopTestDatabase,
  resetDatabase,
  getPrisma,
} from './helpers/test-database';
import { seedPermissions } from './helpers/seed-permissions';
import type { TestEmailDispatcher } from './helpers/test-email-dispatcher';
import { registerAndVerify } from './helpers/auth-flow';
import { addScopedMember, provisionOperator } from './helpers/operator';
import { resetPairingLimits } from './helpers/pairing-limits';
import { pairRobot, type DeviceTransport } from '../scripts/fake-robot/pairing';
import { RobotAuthService } from '../src/modules/robots/services/robot-auth.service';
import { RobotPairingsRepository } from '../src/modules/robots/repositories/robot-pairings.repository.interface';
import { TenantContext } from '../src/shared/tenancy/tenant-context';

const PASSWORD = 'StrongPass@123';

const USERS = {
  opAdminX: 'op-admin-x@example.com',
  opStaffX: 'op-staff-x@example.com',
  clientAdminA: 'client-admin-a@example.com',
  clientEditorA: 'client-editor-a@example.com',
  advertiserA: 'advertiser-a@example.com',
  pairOnlyX: 'pair-only-x@example.com',
  opAdminY: 'op-admin-y@example.com',
} as const;

type UserKey = keyof typeof USERS;

interface RobotBody {
  id: string;
  serial: string;
  name: string;
  clientId: string;
  siteId: string;
  status: string;
}

interface Paired {
  robotId: string;
  deviceToken: string;
  pairingId: string;
  code: string;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('Robots and pairing (e2e)', () => {
  let app: INestApplication;
  let server: App;
  let emailDispatcher: TestEmailDispatcher;
  let auth: RobotAuthService;
  const tokens = {} as Record<UserKey, string>;
  let workspaceX: string;
  let workspaceY: string;
  let clientA: string;
  let clientB: string;
  let siteA: string;
  let siteB: string;
  let siteY: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  };

  const as = (user: UserKey, workspaceId = workspaceX) => ({
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
    patch: (path: string, body: object) =>
      request(server)
        .patch(path)
        .set('Authorization', `Bearer ${tokens[user]}`)
        .set('x-workspace-id', workspaceId)
        .send(body),
    delete: (path: string) =>
      request(server)
        .delete(path)
        .set('Authorization', `Bearer ${tokens[user]}`)
        .set('x-workspace-id', workspaceId),
  });

  // The robot's side, with no login: the same transport the fake-robot flow takes.
  const device: DeviceTransport = async (path, body) => {
    const res = await request(server)
      .post(`/api/v1${path}`)
      .send(body as object);
    return { status: res.status, body: res.body as unknown };
  };

  const start = async (serial: string): Promise<PairStartResponse> => {
    const res = await device('/device/pair/start', { serial });
    expect(res.status).toBe(201);
    return pairStartResponseSchema.parse(res.body);
  };

  const poll = async (pairingId: string): Promise<PairPollResponse> => {
    const res = await device('/device/pair', { pairingId });
    expect(res.status).toBe(200);
    return pairPollResponseSchema.parse(res.body);
  };

  const approve = (code: string, siteId: string, user: UserKey = 'opAdminX', workspace?: string) =>
    as(user, workspace).post('/api/v1/robots/pairings/approve', { code, siteId });

  // Start, approve and fetch the token right away (the first poll is never rate limited).
  const pair = async (
    serial: string,
    siteId: string,
    user: UserKey = 'opAdminX',
    workspace?: string,
  ): Promise<Paired> => {
    const started = await start(serial);
    await approve(started.code, siteId, user, workspace).expect(201);
    const delivered = await poll(started.pairingId);
    if (delivered.status !== 'approved')
      throw new Error(`expected approved, got ${delivered.status}`);
    return { ...delivered, pairingId: started.pairingId, code: started.code };
  };

  const createSite = async (clientId: string, name: string, user: UserKey = 'opAdminX') =>
    (
      (
        await as(user, user === 'opAdminY' ? workspaceY : workspaceX)
          .post('/api/v1/sites', { clientId, name, timezone: 'America/Sao_Paulo' })
          .expect(201)
      ).body as { id: string }
    ).id;

  const createClient = async (name: string, user: UserKey = 'opAdminX') =>
    (
      (
        await as(user, user === 'opAdminY' ? workspaceY : workspaceX)
          .post('/api/v1/clients', { name })
          .expect(201)
      ).body as { id: string }
    ).id;

  beforeAll(async () => {
    await startTestDatabase();
    const { createTestApp } = require('./helpers/test-app') as typeof import('./helpers/test-app');
    ({ app, emailDispatcher } = await createTestApp());
    // One listening server: supertest otherwise opens a server per request, and bursts of
    // simultaneous requests (the race tests) reset connections.
    await app.listen(0);
    server = app.getHttpServer() as App;
    auth = app.get(RobotAuthService);

    await resetDatabase();
    await seedPermissions();

    for (const email of Object.values(USERS)) {
      await registerAndVerify(server, emailDispatcher, { email, name: email, password: PASSWORD });
    }
    workspaceX = await provisionOperator(app, USERS.opAdminX, { name: 'Operator X' });
    workspaceY = await provisionOperator(app, USERS.opAdminY, { name: 'Operator Y' });
    for (const key of Object.keys(USERS) as UserKey[]) tokens[key] = await login(USERS[key]);

    clientA = await createClient('Shopping A');
    clientB = await createClient('Shopping B');
    siteA = await createSite(clientA, 'A - Piso L1');
    siteB = await createSite(clientB, 'B - Piso L1');
    siteY = await createSite(
      await createClient('Shopping Y', 'opAdminY'),
      'Y - Piso L1',
      'opAdminY',
    );

    await addScopedMember(workspaceX, USERS.opStaffX, 'operator_staff', {
      clientId: null,
      advertiserId: null,
    });
    const inA = { clientId: clientA, advertiserId: null };
    await addScopedMember(workspaceX, USERS.clientAdminA, 'client_admin', inA);
    await addScopedMember(workspaceX, USERS.clientEditorA, 'client_editor', inA);
    await addScopedMember(workspaceX, USERS.advertiserA, 'advertiser', {
      clientId: clientA,
      advertiserId: 'adv-1',
    });
    // A custom operator role that pairs robots and nothing else.
    const pairPermission = await getPrisma().permission.findFirstOrThrow({
      where: { key: 'robot:pair', workspaceId: null },
    });
    await getPrisma().role.create({
      data: {
        name: 'pair_only',
        workspaceId: workspaceX,
        permissions: { create: [{ permissionId: pairPermission.id }] },
      },
    });
    await addScopedMember(workspaceX, USERS.pairOnlyX, 'pair_only', {
      clientId: null,
      advertiserId: null,
    });
  });

  beforeEach(async () => {
    await resetPairingLimits();
  });

  afterAll(async () => {
    await app.close();
    await stopTestDatabase();
  });

  describe('pairing flow', () => {
    it('pairs a simulated robot end to end and keeps every secret out of the database', async () => {
      let code = '';
      let pairingId = '';
      const seen: string[] = [];

      const robot = await pairRobot({
        transport: device,
        serial: 'LB-E2E-0001',
        pollIntervalMs: 1_050,
        onCode: (started) => {
          ({ code, pairingId } = started);
        },
        onPoll: async (response) => {
          seen.push(response.status);
          if (response.status !== 'pending' || seen.length > 1) return;

          const lookup = await as('opAdminX')
            .post('/api/v1/robots/pairings/lookup', { code })
            .expect(200);
          expect(lookup.body).toMatchObject({ serial: 'LB-E2E-0001', robot: null });

          const approved = await as('opAdminX')
            .post('/api/v1/robots/pairings/approve', { code, siteId: siteA, name: 'Robot A1' })
            .expect(201);
          expect(approved.body).toMatchObject({
            serial: 'LB-E2E-0001',
            name: 'Robot A1',
            clientId: clientA,
            siteId: siteA,
            status: 'pending',
            model: 'luckibot_plus',
            romVersion: null,
            appVersion: null,
          });
          expect(approved.body).not.toHaveProperty('deviceTokenHash');
        },
      });

      expect(seen).toEqual(['pending', 'approved']);
      // Delivered once: the pairing is gone.
      await resetPairingLimits();
      await expect(poll(pairingId)).resolves.toEqual({ status: 'expired' });

      const row = await getPrisma().robot.findUniqueOrThrow({ where: { id: robot.robotId } });
      expect(row.status).toBe('active');
      expect(row.deviceTokenHash).toBe(sha256(robot.deviceToken));
      await expect(auth.authenticate(robot.deviceToken)).resolves.toMatchObject({
        id: robot.robotId,
        organizationId: row.organizationId,
        clientId: clientA,
        siteId: siteA,
      });

      const stored = JSON.stringify([
        await getPrisma().robot.findMany(),
        await getPrisma().robotPairing.findMany(),
        await getPrisma().auditLog.findMany(),
      ]);
      expect(stored).not.toContain(robot.deviceToken);
      expect(stored).not.toContain(pairingId);
      expect(stored).not.toContain(`"${code}"`);

      const audit = await getPrisma().auditLog.findMany({
        where: { resourceId: robot.robotId },
      });
      expect(audit.map((log) => log.action)).toEqual(['robot.paired']);
      expect(audit[0]!.metadata).toMatchObject({
        body: { code: '[REDACTED]', siteId: siteA, name: 'Robot A1' },
      });
      // The lookup is a read: never audited.
      expect(await getPrisma().auditLog.count({ where: { action: { contains: 'lookup' } } })).toBe(
        0,
      );
    });

    it('answers expired for an unknown pairing and 400 for bodies outside the contract', async () => {
      await expect(poll(randomUUID())).resolves.toEqual({ status: 'expired' });

      for (const [path, body] of [
        ['/device/pair/start', {}],
        ['/device/pair/start', { serial: 'has spaces' }],
        ['/device/pair/start', { serial: 42 }],
        ['/device/pair', {}],
        ['/device/pair', { pairingId: 'not-a-uuid' }],
      ] as const) {
        const res = await device(path, body);
        expect({ path, body, status: res.status }).toEqual({ path, body, status: 400 });
        expect(res.body).toMatchObject({ statusCode: 400, message: 'Validation failed' });
      }
    });

    it('rejects wrong and expired codes, then blocks the user after 5 misses', async () => {
      const expired = await start('LB-E2E-0002');
      await getPrisma().robotPairing.update({
        where: { code: expired.code },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });
      const valid = await start('LB-E2E-0003');
      const wrong = ['000000', '999999', '111111', '222222', '333333'].filter(
        (code) => code !== valid.code && code !== expired.code,
      );

      const lookup = (code: string) =>
        as('opAdminX').post('/api/v1/robots/pairings/lookup', { code });
      expect((await lookup(expired.code)).status).toBe(404);
      expect((await approve(expired.code, siteA)).status).toBe(404);
      for (const code of wrong.slice(0, 3)) expect((await lookup(code)).status).toBe(404);

      // Five misses: even the right code is refused now, in lookup and in approve.
      expect((await lookup(valid.code)).status).toBe(429);
      expect((await approve(valid.code, siteA)).status).toBe(429);
      // Other users keep their own attempts.
      await as('opStaffX').post('/api/v1/robots/pairings/lookup', { code: valid.code }).expect(200);
    });

    it('counts simultaneous wrong codes atomically, so a burst gets no extra guesses', async () => {
      await getPrisma().robotPairing.deleteMany();
      const valid = await start('LB-E2E-0007');
      const guesses = Array.from({ length: 20 }, (_, i) => String(i).padStart(6, '0')).filter(
        (code) => code !== valid.code,
      );

      const statuses = await Promise.all(
        guesses.map(async (code) => {
          const res = await as('opStaffX').post('/api/v1/robots/pairings/lookup', { code });
          return res.status;
        }),
      );

      expect(statuses.filter((s) => s === 404)).toHaveLength(5);
      expect(statuses.filter((s) => s === 429)).toHaveLength(guesses.length - 5);
      await as('opStaffX').post('/api/v1/robots/pairings/lookup', { code: valid.code }).expect(429);
    });

    it('limits starts per IP and polls per pairing', async () => {
      const started: PairStartResponse[] = [];
      for (let i = 0; i < 10; i++) started.push(await start(`LB-E2E-1${i}`));
      expect((await device('/device/pair/start', { serial: 'LB-E2E-19' })).status).toBe(429);

      await poll(started[0]!.pairingId);
      expect((await device('/device/pair', { pairingId: started[0]!.pairingId })).status).toBe(429);
      await poll(started[1]!.pairingId);
    });

    it('delivers the token to exactly one of two simultaneous polls', async () => {
      const started = await start('LB-E2E-0004');
      await approve(started.code, siteA).expect(201);

      const results = await Promise.all([
        device('/device/pair', { pairingId: started.pairingId }),
        device('/device/pair', { pairingId: started.pairingId }),
      ]);
      const approved = results.filter(
        (r) => r.status === 200 && (r.body as PairPollResponse).status === 'approved',
      );
      expect(approved).toHaveLength(1);
      for (const other of results.filter((r) => !approved.includes(r))) {
        expect([429, 200]).toContain(other.status);
        if (other.status === 200) expect(other.body).toEqual({ status: 'expired' });
      }

      // Same race below the rate limiter: the database alone lets one claim through.
      const next = await start('LB-E2E-0005');
      await approve(next.code, siteA).expect(201);
      const row = await getPrisma().robotPairing.findUniqueOrThrow({ where: { code: next.code } });
      const repository = app.get(RobotPairingsRepository);
      const claim = (hash: string) =>
        TenantContext.runAsSystem(() =>
          repository.claimApproved({
            pairingId: row.id,
            robotId: row.robotId!,
            deviceTokenHash: hash,
            now: new Date(),
          }),
        );
      const claims = await Promise.all([claim(sha256('a')), claim(sha256('b'))]);
      expect(claims.sort()).toEqual([false, true]);
    });

    it('leaves at least a minute to fetch the token when approved near expiry', async () => {
      const started = await start('LB-E2E-0006');
      await getPrisma().robotPairing.update({
        where: { code: started.code },
        data: { expiresAt: new Date(Date.now() + 5_000) },
      });
      const before = Date.now();

      await approve(started.code, siteA).expect(201);

      const row = await getPrisma().robotPairing.findUniqueOrThrow({
        where: { code: started.code },
      });
      expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
    });
  });

  describe('token lifecycle', () => {
    it('revokes the token, and pairing again restores the same robot with a new one', async () => {
      const first = await pair('LB-E2E-0101', siteA);
      await expect(auth.authenticate(first.deviceToken)).resolves.not.toBeNull();

      const revoked = await as('opAdminX')
        .post(`/api/v1/robots/${first.robotId}/revoke`)
        .expect(200);
      expect(revoked.body).toMatchObject({ id: first.robotId, status: 'revoked' });
      await expect(auth.authenticate(first.deviceToken)).resolves.toBeNull();

      const again = await start('LB-E2E-0101');
      const lookup = await as('opAdminX')
        .post('/api/v1/robots/pairings/lookup', { code: again.code })
        .expect(200);
      expect(lookup.body).toMatchObject({ robot: { id: first.robotId, status: 'revoked' } });
      await approve(again.code, siteA).expect(201);
      const second = await poll(again.pairingId);
      if (second.status !== 'approved') throw new Error('expected approved');
      expect(second.robotId).toBe(first.robotId);
      await expect(auth.authenticate(second.deviceToken)).resolves.toMatchObject({
        id: first.robotId,
        status: 'active',
      });
      await expect(auth.authenticate(first.deviceToken)).resolves.toBeNull();

      // Pairing an active robot again replaces its token.
      const third = await pair('LB-E2E-0101', siteA);
      expect(third.robotId).toBe(first.robotId);
      await expect(auth.authenticate(second.deviceToken)).resolves.toBeNull();
      await expect(auth.authenticate(third.deviceToken)).resolves.not.toBeNull();

      const actions = await getPrisma().auditLog.findMany({
        where: { resourceId: first.robotId },
        orderBy: { createdAt: 'asc' },
      });
      expect(actions.map((log) => log.action)).toEqual([
        'robot.paired',
        'robot.revoked',
        'robot.paired',
        'robot.paired',
      ]);
    });

    it('drops an approval still waiting for delivery when the robot is revoked', async () => {
      const paired = await pair('LB-E2E-0102', siteA);
      const again = await start('LB-E2E-0102');
      await approve(again.code, siteA).expect(201);

      await as('opAdminX').post(`/api/v1/robots/${paired.robotId}/revoke`).expect(200);

      await expect(poll(again.pairingId)).resolves.toEqual({ status: 'expired' });
      const row = await getPrisma().robot.findUniqueOrThrow({ where: { id: paired.robotId } });
      expect(row).toMatchObject({ status: 'revoked', deviceTokenHash: null });
    });

    it('moves a robot to a site of another client and keeps its token', async () => {
      const paired = await pair('LB-E2E-0103', siteA);

      const moved = await as('opAdminX')
        .post(`/api/v1/robots/${paired.robotId}/move`, { siteId: siteB })
        .expect(200);
      expect(moved.body).toMatchObject({ siteId: siteB, clientId: clientB, status: 'active' });
      await expect(auth.authenticate(paired.deviceToken)).resolves.toMatchObject({
        siteId: siteB,
        clientId: clientB,
      });

      await as('opAdminX')
        .post(`/api/v1/robots/${paired.robotId}/move`, { siteId: siteY })
        .expect(404);
      const deleted = await createSite(clientA, 'A - closed');
      await as('opAdminX').delete(`/api/v1/sites/${deleted}`).expect(204);
      await as('opAdminX')
        .post(`/api/v1/robots/${paired.robotId}/move`, { siteId: deleted })
        .expect(404);
      await approve((await start('LB-E2E-0104')).code, deleted).expect(404);

      const renamed = await as('opAdminX')
        .patch(`/api/v1/robots/${paired.robotId}`, { name: '  Robot B1 ' })
        .expect(200);
      expect(renamed.body).toMatchObject({ name: 'Robot B1' });

      const actions = await getPrisma().auditLog.findMany({
        where: { resourceId: paired.robotId },
        orderBy: { createdAt: 'asc' },
      });
      expect(actions.map((log) => log.action)).toEqual([
        'robot.paired',
        'robot.moved',
        'robot.renamed',
      ]);
    });

    it('refuses to delete a site that still has a robot', async () => {
      const site = await createSite(clientA, 'A - Piso L3');
      const paired = await pair('LB-E2E-0105', site);

      await as('opAdminX').delete(`/api/v1/sites/${site}`).expect(409);

      await as('opAdminX')
        .post(`/api/v1/robots/${paired.robotId}/move`, { siteId: siteA })
        .expect(200);
      await as('opAdminX').delete(`/api/v1/sites/${site}`).expect(204);
    });
  });

  describe('pairing an existing robot again', () => {
    const approveAgain = async (serial: string, siteId: string, user: UserKey) => {
      const started = await start(serial);
      return { started, res: await approve(started.code, siteId, user) };
    };

    it('refuses operator staff taking the token of an active robot', async () => {
      const paired = await pair('LB-E2E-0501', siteA);

      const { res } = await approveAgain('LB-E2E-0501', siteA, 'opStaffX');

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        message:
          'Pairing this robot again requires robot:revoke (it is active and loses its token)',
      });
      await expect(auth.authenticate(paired.deviceToken)).resolves.toMatchObject({
        id: paired.robotId,
      });
      const row = await getPrisma().robot.findUniqueOrThrow({ where: { id: paired.robotId } });
      expect(row).toMatchObject({ status: 'active', siteId: siteA });
    });

    it('lets the admin pair an active robot again; the old token dies on delivery', async () => {
      const paired = await pair('LB-E2E-0502', siteA);

      const { started, res } = await approveAgain('LB-E2E-0502', siteA, 'opAdminX');

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: paired.robotId, status: 'active' });
      // Still valid until the robot fetches the new token.
      await expect(auth.authenticate(paired.deviceToken)).resolves.not.toBeNull();
      const delivered = await poll(started.pairingId);
      if (delivered.status !== 'approved') throw new Error('expected approved');
      await expect(auth.authenticate(paired.deviceToken)).resolves.toBeNull();
      await expect(auth.authenticate(delivered.deviceToken)).resolves.toMatchObject({
        id: paired.robotId,
      });
    });

    it('lets operator staff pair a revoked robot again at the same site', async () => {
      const paired = await pair('LB-E2E-0503', siteA);
      await as('opAdminX').post(`/api/v1/robots/${paired.robotId}/revoke`).expect(200);

      const { started, res } = await approveAgain('LB-E2E-0503', siteA, 'opStaffX');

      expect(res.status).toBe(201);
      const delivered = await poll(started.pairingId);
      if (delivered.status !== 'approved') throw new Error('expected approved');
      expect(delivered.robotId).toBe(paired.robotId);
      await expect(auth.authenticate(delivered.deviceToken)).resolves.not.toBeNull();
    });

    it('refuses a role with only robot:pair moving a robot through a new pairing', async () => {
      const paired = await pair('LB-E2E-0504', siteA);
      await as('opAdminX').post(`/api/v1/robots/${paired.robotId}/revoke`).expect(200);

      const { res } = await approveAgain('LB-E2E-0504', siteB, 'pairOnlyX');

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        message: 'Pairing this robot again requires robot:move (the site changes)',
      });
      const row = await getPrisma().robot.findUniqueOrThrow({ where: { id: paired.robotId } });
      expect(row).toMatchObject({ siteId: siteA, clientId: clientA, status: 'revoked' });
    });

    it('answers a double click on a new serial with "already approved", not another organization', async () => {
      const started = await start('LB-E2E-0505');

      const results = await Promise.all([
        approve(started.code, siteA),
        approve(started.code, siteA),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)!.body).toMatchObject({
        message: 'This pairing was already approved',
      });
      expect(await getPrisma().robot.count({ where: { serial: 'LB-E2E-0505' } })).toBe(1);
    });
  });

  describe('tenancy and roles', () => {
    it('refuses a serial paired by another operator without saying whose it is', async () => {
      const inY = await pair('LB-E2E-0201', siteY, 'opAdminY', workspaceY);
      const robotY = await getPrisma().robot.findUniqueOrThrow({ where: { id: inY.robotId } });

      const started = await start('LB-E2E-0201');
      const res = await approve(started.code, siteA);

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        message: 'This robot is registered to another organization',
      });
      const body = JSON.stringify(res.body);
      for (const leaked of [robotY.id, robotY.organizationId, robotY.siteId, robotY.name]) {
        expect(body).not.toContain(leaked);
      }
      await expect(auth.authenticate(inY.deviceToken)).resolves.toMatchObject({ id: inY.robotId });
    });

    it('shows client users only their own robots and keeps every write operator-only', async () => {
      const inA = await pair('LB-E2E-0301', siteA);
      const inB = await pair('LB-E2E-0302', siteB);

      for (const user of ['clientAdminA', 'clientEditorA'] as const) {
        const list = await as(user).get('/api/v1/robots').expect(200);
        const ids = (list.body as RobotBody[]).map((r) => r.id);
        expect(ids).toContain(inA.robotId);
        expect(ids).not.toContain(inB.robotId);
        expect((list.body as RobotBody[]).every((r) => r.clientId === clientA)).toBe(true);
        await as(user).get(`/api/v1/robots/${inA.robotId}`).expect(200);
        await as(user).get(`/api/v1/robots/${inB.robotId}`).expect(404);
      }

      const started = await start('LB-E2E-0303');
      for (const user of ['clientAdminA', 'clientEditorA', 'advertiserA'] as const) {
        await as(user).post('/api/v1/robots/pairings/lookup', { code: started.code }).expect(403);
        await approve(started.code, siteA, user).expect(403);
        await as(user).patch(`/api/v1/robots/${inA.robotId}`, { name: 'Mine' }).expect(403);
        await as(user).post(`/api/v1/robots/${inA.robotId}/move`, { siteId: siteA }).expect(403);
        await as(user).post(`/api/v1/robots/${inA.robotId}/revoke`).expect(403);
      }
      await as('advertiserA').get('/api/v1/robots').expect(403);
      await as('advertiserA').get(`/api/v1/robots/${inA.robotId}`).expect(403);
      await expect(auth.authenticate(inA.deviceToken)).resolves.not.toBeNull();
    });

    it('lets operator staff pair, rename and move robots, but not revoke them', async () => {
      const paired = await pair('LB-E2E-0401', siteA, 'opStaffX');

      await as('opStaffX')
        .patch(`/api/v1/robots/${paired.robotId}`, { name: 'Robot by staff' })
        .expect(200);
      await as('opStaffX')
        .post(`/api/v1/robots/${paired.robotId}/move`, { siteId: siteB })
        .expect(200);
      await as('opStaffX').post(`/api/v1/robots/${paired.robotId}/revoke`).expect(403);
      await expect(auth.authenticate(paired.deviceToken)).resolves.not.toBeNull();

      const filtered = await as('opStaffX').get(`/api/v1/robots?siteId=${siteB}`).expect(200);
      expect((filtered.body as RobotBody[]).map((r) => r.id)).toContain(paired.robotId);
    });
  });
});
