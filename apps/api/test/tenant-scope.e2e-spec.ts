import { INestApplication } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
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
import type { ScopedPrismaService } from '../src/shared/tenancy/scoped-prisma.service';
import { TenantContext } from '../src/shared/tenancy/tenant-context';
import { TenantScopeError } from '../src/shared/tenancy/tenant-scope.rewriter';
import type { TenantScope } from '../src/shared/tenancy/tenant-scope';

const PASSWORD = 'StrongPass@123';
const CLIENT_A = 'client-a';
const CLIENT_B = 'client-b';
const ADV_1 = 'adv-1';
const ADV_2 = 'adv-2';

const USERS = {
  opAdminX: 'op-admin-x@example.com',
  opStaffX: 'op-staff-x@example.com',
  clientAdminA: 'client-admin-a@example.com',
  clientEditorA: 'client-editor-a@example.com',
  clientAdminB: 'client-admin-b@example.com',
  advertiserA1: 'advertiser-a1@example.com',
  advertiserA2: 'advertiser-a2@example.com',
  opAdminY: 'op-admin-y@example.com',
} as const;

type UserKey = keyof typeof USERS;

interface MemberRow {
  id: string;
  user: { email: string };
}

describe('Tenant scope (e2e)', () => {
  let app: INestApplication;
  let server: App;
  let emailDispatcher: TestEmailDispatcher;
  let scoped: ScopedPrismaService;
  const tokens = {} as Record<UserKey, string>;
  let workspaceX: string;
  let workspaceY: string;
  let organizationX: string;
  let organizationY: string;

  const get = (path: string, user: UserKey, workspaceId?: string) => {
    const req = request(server).get(path).set('Authorization', `Bearer ${tokens[user]}`);
    return workspaceId ? req.set('x-workspace-id', workspaceId) : req;
  };

  const memberEmails = async (user: UserKey, workspaceId: string): Promise<string[]> => {
    const res = await get(`/api/v1/workspaces/${workspaceId}/members`, user, workspaceId).expect(
      200,
    );
    return (res.body as MemberRow[]).map((m) => m.user.email).sort();
  };

  const auditActions = async (user: UserKey, workspaceId: string): Promise<string[]> => {
    const res = await get('/api/v1/audit-logs?action=scope.test*', user, workspaceId).expect(200);
    return (res.body as { data: { action: string }[] }).data.map((l) => l.action).sort();
  };

  const scopeOf = (overrides: Partial<TenantScope>): TenantScope => ({
    organizationId: organizationX,
    workspaceId: workspaceX,
    clientId: null,
    advertiserId: null,
    ...overrides,
  });

  const login = async (email: string): Promise<string> => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  };

  beforeAll(async () => {
    await startTestDatabase();
    const { createTestApp } = require('./helpers/test-app') as typeof import('./helpers/test-app');
    ({ app, emailDispatcher } = await createTestApp());
    server = app.getHttpServer() as App;
    // Loaded lazily like the app: importing it at the top would parse env before the container exists.
    const { ScopedPrismaService: token } =
      require('../src/shared/tenancy/scoped-prisma.service') as typeof import('../src/shared/tenancy/scoped-prisma.service');
    scoped = app.get(token);

    await resetDatabase();
    await seedPermissions();

    for (const email of Object.values(USERS)) {
      await registerAndVerify(server, emailDispatcher, { email, name: email, password: PASSWORD });
    }
    workspaceX = await provisionOperator(app, USERS.opAdminX, { name: 'Operator X' });
    workspaceY = await provisionOperator(app, USERS.opAdminY, { name: 'Operator Y' });

    const prisma = getPrisma();
    organizationX = (await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceX } }))
      .organizationId;
    organizationY = (await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceY } }))
      .organizationId;

    const none = { clientId: null, advertiserId: null };
    await addScopedMember(workspaceX, USERS.opStaffX, 'operator_staff', none);
    await addScopedMember(workspaceX, USERS.clientAdminA, 'client_admin', {
      clientId: CLIENT_A,
      advertiserId: null,
    });
    await addScopedMember(workspaceX, USERS.clientEditorA, 'client_editor', {
      clientId: CLIENT_A,
      advertiserId: null,
    });
    await addScopedMember(workspaceX, USERS.clientAdminB, 'client_admin', {
      clientId: CLIENT_B,
      advertiserId: null,
    });
    await addScopedMember(workspaceX, USERS.advertiserA1, 'advertiser', {
      clientId: CLIENT_A,
      advertiserId: ADV_1,
    });
    await addScopedMember(workspaceX, USERS.advertiserA2, 'advertiser', {
      clientId: CLIENT_A,
      advertiserId: ADV_2,
    });

    const audit = (
      action: string,
      organizationId: string,
      workspaceId: string,
      clientId: string | null,
    ) => ({
      id: randomUUID(),
      action,
      organizationId,
      workspaceId,
      clientId,
      hash: randomUUID(),
    });
    await prisma.auditLog.createMany({
      data: [
        audit('scope.test.a', organizationX, workspaceX, CLIENT_A),
        audit('scope.test.b', organizationX, workspaceX, CLIENT_B),
        audit('scope.test.org', organizationX, workspaceX, null),
        audit('scope.test.y', organizationY, workspaceY, null),
      ],
    });

    for (const key of Object.keys(USERS) as UserKey[]) tokens[key] = await login(USERS[key]);
  });

  afterAll(async () => {
    await app.close();
    await stopTestDatabase();
  });

  const clientAMembers = [
    USERS.advertiserA1,
    USERS.advertiserA2,
    USERS.clientAdminA,
    USERS.clientEditorA,
  ].sort();

  describe('through the HTTP API', () => {
    it('operator admin sees everything in its own organization', async () => {
      expect(await memberEmails('opAdminX', workspaceX)).toEqual(
        Object.values(USERS)
          .filter((email) => email !== USERS.opAdminY)
          .sort(),
      );
      expect(await auditActions('opAdminX', workspaceX)).toEqual([
        'scope.test.a',
        'scope.test.b',
        'scope.test.org',
      ]);
    });

    it('operator staff reads everything but cannot manage members', async () => {
      expect(await memberEmails('opStaffX', workspaceX)).toHaveLength(7);
      expect(await auditActions('opStaffX', workspaceX)).toHaveLength(3);

      const roles = await getPrisma().role.findMany({ where: { workspaceId: workspaceX } });
      const staffRole = roles.find((r) => r.name === 'operator_staff')!;
      await request(server)
        .post('/api/v1/invitations')
        .set('Authorization', `Bearer ${tokens.opStaffX}`)
        .set('x-workspace-id', workspaceX)
        .send({ email: 'someone@example.com', roleId: staffRole.id })
        .expect(403);
    });

    it('client admin only sees its own client', async () => {
      expect(await memberEmails('clientAdminA', workspaceX)).toEqual(clientAMembers);
      expect(await auditActions('clientAdminA', workspaceX)).toEqual(['scope.test.a']);
      expect(await memberEmails('clientAdminB', workspaceX)).toEqual([USERS.clientAdminB]);
      expect(await auditActions('clientAdminB', workspaceX)).toEqual(['scope.test.b']);
    });

    it('client editor sees its client members but has no audit access', async () => {
      expect(await memberEmails('clientEditorA', workspaceX)).toEqual(clientAMembers);
      await get('/api/v1/audit-logs', 'clientEditorA', workspaceX).expect(403);
    });

    it('advertiser only sees what belongs to it', async () => {
      expect(await memberEmails('advertiserA1', workspaceX)).toEqual([USERS.advertiserA1]);
      expect(await memberEmails('advertiserA2', workspaceX)).toEqual([USERS.advertiserA2]);
      await get('/api/v1/audit-logs', 'advertiserA1', workspaceX).expect(403);
    });

    it('nobody crosses into another organization', async () => {
      await get(`/api/v1/workspaces/${workspaceY}/members`, 'clientAdminA', workspaceY).expect(403);
      await get(`/api/v1/workspaces/${workspaceY}/members`, 'opAdminX', workspaceY).expect(403);
      await get('/api/v1/audit-logs', 'opAdminX', workspaceY).expect(403);
      await get(`/api/v1/workspaces/${workspaceX}/members`, 'opAdminY', workspaceX).expect(403);

      expect(await memberEmails('opAdminY', workspaceY)).toEqual([USERS.opAdminY]);
      expect(await auditActions('opAdminY', workspaceY)).toEqual(['scope.test.y']);
    });

    it('/auth/me and /workspaces of a client user carry nothing from other clients', async () => {
      const me = await get('/api/v1/auth/me', 'clientAdminA').expect(200);
      const workspaces = await get('/api/v1/workspaces', 'clientAdminA').expect(200);
      const body = JSON.stringify([me.body, workspaces.body]);
      expect(body).not.toContain(USERS.clientAdminB);
      expect(body).not.toContain(CLIENT_B);
      expect((workspaces.body as { id: string }[]).map((w) => w.id)).toEqual([workspaceX]);
    });

    it('keeps billing switched off', async () => {
      // GET /workspaces/features is shadowed by GET /workspaces/:workspaceId (inherited route order), so
      // the effective flag is read from the service the endpoint delegates to.
      const { FeatureFlagsService } =
        require('../src/modules/feature-flags/services/feature-flags.service') as typeof import('../src/modules/feature-flags/services/feature-flags.service');
      expect(await app.get(FeatureFlagsService).isEnabled(workspaceX, 'billing')).toBe(false);
    });
  });

  describe('relations loaded from unscoped models', () => {
    const asClientA = <T>(fn: () => Promise<T>) =>
      TenantContext.runWithScope(scopeOf({ clientId: CLIENT_A }), fn);

    it('filters members included from the workspace', async () => {
      const workspace = await asClientA(() =>
        scoped.client.workspace.findUniqueOrThrow({
          where: { id: workspaceX },
          include: { members: { include: { user: true } } },
        }),
      );
      expect(workspace.members.map((m) => m.user.email).sort()).toEqual(clientAMembers);
      expect(workspace.members.every((m) => m.clientId === CLIENT_A)).toBe(true);
    });

    it('filters memberships included from users and relation counts', async () => {
      const users = await asClientA(() =>
        scoped.client.user.findMany({ include: { memberships: true, auditLogs: true } }),
      );
      const memberships = users.flatMap((u) => u.memberships);
      expect(memberships).toHaveLength(4);
      expect(memberships.every((m) => m.clientId === CLIENT_A)).toBe(true);

      const counted = await asClientA(() =>
        scoped.client.workspace.findUniqueOrThrow({
          where: { id: workspaceX },
          select: { _count: { select: { members: true, auditLogs: true } } },
        }),
      );
      expect(counted._count).toEqual({ members: 4, auditLogs: 1 });
    });

    it('filters relation filters so they cannot probe other clients', async () => {
      const probe = await asClientA(() =>
        scoped.client.user.findMany({
          where: { memberships: { some: { clientId: CLIENT_B } } },
        }),
      );
      expect(probe).toEqual([]);
    });

    it('rejects nested writes into scoped models and writes nothing', async () => {
      const before = await getPrisma().workspaceMember.count({ where: { clientId: CLIENT_B } });
      const outsider = await getPrisma().user.findUniqueOrThrow({
        where: { email: USERS.opAdminY },
      });
      const role = await getPrisma().role.findFirstOrThrow({ where: { workspaceId: workspaceX } });

      await expect(
        asClientA(() =>
          scoped.client.workspace.update({
            where: { id: workspaceX },
            data: {
              members: { create: { userId: outsider.id, roleId: role.id, clientId: CLIENT_B } },
            },
          }),
        ),
      ).rejects.toBeInstanceOf(TenantScopeError);
      expect(await getPrisma().workspaceMember.count({ where: { clientId: CLIENT_B } })).toBe(
        before,
      );
    });

    it('refuses scoped models when no scope is set', async () => {
      await expect(
        TenantContext.run(async () => await scoped.client.workspaceMember.findMany()),
      ).rejects.toBeInstanceOf(TenantScopeError);
    });
  });

  describe('aggregations and transactions', () => {
    it('applies the scope to count, aggregate and groupBy', async () => {
      const result = await TenantContext.runWithScope(
        scopeOf({ clientId: CLIENT_A }),
        async () => ({
          count: await scoped.client.workspaceMember.count(),
          aggregate: await scoped.client.auditLog.aggregate({ _count: { _all: true } }),
          groups: await scoped.client.workspaceMember.groupBy({
            by: ['clientId'],
            _count: { _all: true },
          }),
        }),
      );
      expect(result.count).toBe(4);
      expect(result.aggregate._count._all).toBe(1);
      expect(result.groups).toEqual([{ clientId: CLIENT_A, _count: { _all: 4 } }]);
    });

    it('keeps the scope inside an interactive transaction', async () => {
      const outsider = await getPrisma().user.findUniqueOrThrow({
        where: { email: USERS.opAdminY },
      });
      const role = await getPrisma().role.findFirstOrThrow({ where: { workspaceId: workspaceX } });

      await TenantContext.runWithScope(scopeOf({ clientId: CLIENT_A }), async () => {
        const seen = await scoped.client.$transaction(async (tx) => ({
          members: await tx.workspaceMember.findMany(),
          audit: await tx.auditLog.count(),
        }));
        expect(seen.members).toHaveLength(4);
        expect(seen.members.every((m) => m.clientId === CLIENT_A)).toBe(true);
        expect(seen.audit).toBe(1);

        await expect(
          scoped.client.$transaction(async (tx) =>
            tx.workspaceMember.create({
              data: {
                userId: outsider.id,
                workspaceId: workspaceX,
                roleId: role.id,
                clientId: CLIENT_B,
              },
            }),
          ),
        ).rejects.toThrow('outside the current tenant scope');
      });
      expect(await getPrisma().workspaceMember.count({ where: { userId: outsider.id } })).toBe(1);
    });
  });

  describe('a freshly registered user', () => {
    it('sees no organization or workspace at all', async () => {
      const organizationsBefore = await getPrisma().organization.count();
      const email = 'newcomer@example.com';
      await registerAndVerify(server, emailDispatcher, {
        email,
        name: 'Newcomer',
        password: PASSWORD,
      });
      const token = await login(email);
      const auth = { Authorization: `Bearer ${token}` };

      const workspaces = await request(server).get('/api/v1/workspaces').set(auth).expect(200);
      expect(workspaces.body).toEqual([]);
      const me = await request(server).get('/api/v1/auth/me').set(auth).expect(200);
      expect(me.body.workspaces).toEqual([]);
      await request(server)
        .get(`/api/v1/workspaces/${workspaceX}/members`)
        .set(auth)
        .set('x-workspace-id', workspaceX)
        .expect(403);
      await request(server)
        .get('/api/v1/audit-logs')
        .set(auth)
        .set('x-workspace-id', workspaceX)
        .expect(403);
      expect(await getPrisma().organization.count()).toBe(organizationsBefore);
    });
  });

  describe('seed', () => {
    it('provisions the operator idempotently and its admin can log in', async () => {
      const env = {
        ...process.env,
        SUPER_ADMIN_EMAIL: 'seed-admin@example.com',
        SUPER_ADMIN_PASSWORD: PASSWORD,
        SUPER_ADMIN_NAME: 'Seed Admin',
        SEED_OPERATOR_NAME: 'Seed Operator',
        SEED_OPERATOR_SLUG: 'seed-operator',
      };
      // Async on purpose: blocking the event loop for the seed's duration breaks the app's Redis clients.
      const seed = () => promisify(execFile)('pnpm', ['exec', 'prisma', 'db', 'seed'], { env });
      await seed();
      await seed();

      const token = await login('seed-admin@example.com');
      const res = await request(server)
        .get('/api/v1/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const operator = (res.body as { id: string; slug: string }[]).find(
        (w) => w.slug === 'seed-operator',
      );
      expect(operator).toBeDefined();

      const members = await request(server)
        .get(`/api/v1/workspaces/${operator!.id}/members`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-workspace-id', operator!.id)
        .expect(200);
      expect(members.body).toEqual([
        expect.objectContaining({
          user: expect.objectContaining({ email: 'seed-admin@example.com' }),
          role: expect.objectContaining({ name: 'operator_admin' }),
        }),
      ]);
      expect(await getPrisma().organization.count({ where: { slug: 'seed-operator' } })).toBe(1);
    });
  });
});
