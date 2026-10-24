import { ForbiddenException, INestApplication } from '@nestjs/common';
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
import { addScopedMember, createClient, provisionOperator } from './helpers/operator';
import { provisionSuperAdmin } from './helpers/super-admin';
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

const SUPER_ADMIN = 'super-admin@example.com';

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
  let superAdminToken: string;

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

    await createClient(organizationX, 'Client A', CLIENT_A);
    await createClient(organizationX, 'Client B', CLIENT_B);

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

    await registerAndVerify(server, emailDispatcher, {
      email: SUPER_ADMIN,
      name: 'Super Admin',
      password: PASSWORD,
    });
    const superAdmin = await prisma.user.findUniqueOrThrow({ where: { email: SUPER_ADMIN } });
    await provisionSuperAdmin(superAdmin.id);
    superAdminToken = await login(SUPER_ADMIN);
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

    it('keeps the cross-tenant audit chain verification to the super admin', async () => {
      await get('/api/v1/audit-logs/verify', 'clientAdminA', workspaceX).expect(403);
      await get('/api/v1/audit-logs/verify', 'opAdminX', workspaceX).expect(403);
      await request(server)
        .get('/api/v1/audit-logs/verify')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .set('x-workspace-id', workspaceX)
        .expect(200);
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
      // The service reads through the scoped client, as it does behind the WorkspaceGuard.
      expect(
        await TenantContext.runWithScope(scopeOf({}), () =>
          app.get(FeatureFlagsService).isEnabled(workspaceX, 'billing'),
        ),
      ).toBe(false);
    });
  });

  describe('super admin fallback', () => {
    it('ignores members of the admin workspace who do not hold the SuperAdmin role', async () => {
      const prisma = getPrisma();
      const email = 'admin-auditor@example.com';
      await registerAndVerify(server, emailDispatcher, {
        email,
        name: 'Auditor',
        password: PASSWORD,
      });
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      const adminWorkspace = await prisma.workspace.findUniqueOrThrow({
        where: { slug: '__admin__' },
      });
      const auditorRole = await prisma.role.create({
        data: { name: 'Auditor', workspaceId: adminWorkspace.id },
      });
      await prisma.workspaceMember.create({
        data: { userId: user.id, workspaceId: adminWorkspace.id, roleId: auditorRole.id },
      });
      const token = await login(email);

      await request(server)
        .get(`/api/v1/workspaces/${workspaceX}/members`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-workspace-id', workspaceX)
        .expect(403);
      await request(server)
        .get(`/api/v1/workspaces/${workspaceX}/members`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .set('x-workspace-id', workspaceX)
        .expect(200);
    });
  });

  describe('role ceilings and grantors', () => {
    const as = (user: UserKey) => ({
      Authorization: `Bearer ${tokens[user]}`,
      'x-workspace-id': workspaceX,
    });
    const memberId = async (email: string) => {
      const user = await getPrisma().user.findUniqueOrThrow({ where: { email } });
      const member = await getPrisma().workspaceMember.findUniqueOrThrow({
        where: { userId_workspaceId: { userId: user.id, workspaceId: workspaceX } },
      });
      return member.id;
    };
    const createRole = async (name: string, permissionKeys: string[]) => {
      const res = await request(server)
        .post('/api/v1/rbac/roles')
        .set(as('opAdminX'))
        .send({ name, permissionKeys })
        .expect(201);
      return res.body.id as string;
    };

    it('keeps a custom role with invite or user permissions away from client memberships', async () => {
      const target = await memberId(USERS.advertiserA2);
      for (const keys of [
        ['workspace:read', 'workspace:invite'],
        ['workspace:read', 'user:read'],
      ]) {
        const roleId = await createRole(`custom-${keys[1]}`, keys);
        await request(server)
          .patch(`/api/v1/workspaces/${workspaceX}/members/${target}`)
          .set(as('opAdminX'))
          .send({ roleId })
          .expect(400);
      }
    });

    it('stops a custom role held by a client membership from growing past the ceiling', async () => {
      const target = await memberId(USERS.advertiserA2);
      const roleId = await createRole('advertiser-reader', ['workspace:read']);
      await request(server)
        .patch(`/api/v1/workspaces/${workspaceX}/members/${target}`)
        .set(as('opAdminX'))
        .send({ roleId })
        .expect(200);

      await request(server)
        .post(`/api/v1/rbac/roles/${roleId}/permissions`)
        .set(as('opAdminX'))
        .send({ permissionKey: 'user:read' })
        .expect(400);
      await request(server)
        .patch(`/api/v1/rbac/roles/${roleId}`)
        .set(as('opAdminX'))
        .send({ permissionKeys: ['workspace:read', 'workspace:invite'] })
        .expect(400);
      const role = await getPrisma().role.findUniqueOrThrow({
        where: { id: roleId },
        include: { permissions: { include: { permission: true } } },
      });
      expect(role.permissions.map((p) => p.permission.key)).toEqual(['workspace:read']);
    });

    it('lets client users neither invite nor assign operator roles', async () => {
      const roles = await getPrisma().role.findMany({ where: { workspaceId: workspaceX } });
      const operatorAdmin = roles.find((r) => r.name === 'operator_admin')!;
      await request(server)
        .post('/api/v1/invitations')
        .set(as('clientAdminA'))
        .send({ email: 'escalation@example.com', roleId: operatorAdmin.id })
        .expect(403);
      await request(server)
        .patch(`/api/v1/workspaces/${workspaceX}/members/${await memberId(USERS.clientEditorA)}`)
        .set(as('clientAdminA'))
        .send({ roleId: operatorAdmin.id })
        .expect(403);
      await request(server)
        .post('/api/v1/rbac/roles')
        .set(as('clientAdminA'))
        .send({ name: 'sneaky', permissionKeys: ['user:read'] })
        .expect(403);
    });
  });

  describe('writes to roles, permissions and feature flags', () => {
    it('are refused to client users and advertisers on every route, and change nothing', async () => {
      const prisma = getPrisma();
      const role = await prisma.role.create({
        data: { name: 'route-target', workspaceId: workspaceX },
      });
      const custom = await prisma.permission.create({
        data: { key: 'custom:route', category: 'custom', workspaceId: workspaceX },
      });
      const snapshot = async () => ({
        roles: await prisma.role.findMany({ orderBy: { id: 'asc' } }),
        links: await prisma.rolePermission.count(),
        permissions: await prisma.permission.findMany({ orderBy: { id: 'asc' } }),
        flags: await prisma.workspaceFeatureFlag.findMany(),
      });
      const before = await snapshot();

      for (const user of ['clientAdminA', 'clientEditorA', 'advertiserA1'] as const) {
        const auth = { Authorization: `Bearer ${tokens[user]}`, 'x-workspace-id': workspaceX };
        await request(server)
          .post('/api/v1/rbac/roles')
          .set(auth)
          .send({ name: 'sneaky', permissionKeys: ['workspace:read'] })
          .expect(403);
        await request(server)
          .patch(`/api/v1/rbac/roles/${role.id}`)
          .set(auth)
          .send({ name: 'renamed' })
          .expect(403);
        await request(server)
          .post(`/api/v1/rbac/roles/${role.id}/permissions`)
          .set(auth)
          .send({ permissionKey: 'workspace:read' })
          .expect(403);
        await request(server).delete(`/api/v1/rbac/roles/${role.id}`).set(auth).expect(403);
        await request(server)
          .post('/api/v1/rbac/permissions')
          .set(auth)
          .send({ key: 'custom:sneaky', category: 'custom' })
          .expect(403);
        await request(server).delete(`/api/v1/rbac/permissions/${custom.id}`).set(auth).expect(403);
        await request(server)
          .put(`/api/v1/admin/workspaces/${workspaceX}/features/billing`)
          .set(auth)
          .send({ enabled: true })
          .expect(403);
        await request(server)
          .delete(`/api/v1/admin/workspaces/${workspaceX}/features/billing`)
          .set(auth)
          .expect(403);
      }

      expect(await snapshot()).toEqual(before);
      await prisma.role.delete({ where: { id: role.id } });
      await prisma.permission.delete({ where: { id: custom.id } });
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

      // As operator, so the nested write (not the operator-only root rule) is what refuses it.
      await expect(
        TenantContext.runWithScope(scopeOf({}), () =>
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

    it('lets client users read their organization but never change it', async () => {
      const outsider = await getPrisma().user.findUniqueOrThrow({
        where: { email: USERS.clientAdminA },
      });
      const before = await getPrisma().organization.findUniqueOrThrow({
        where: { id: organizationX },
      });

      await expect(
        asClientA(() => scoped.client.organization.findUnique({ where: { id: organizationX } })),
      ).resolves.toMatchObject({ id: organizationX });
      await expect(
        asClientA(() =>
          scoped.client.organization.update({
            where: { id: organizationX },
            data: { ownerId: outsider.id },
          }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        asClientA(() =>
          scoped.client.workspace.updateMany({ where: {}, data: { name: 'Taken over' } }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(
        await getPrisma().organization.findUniqueOrThrow({ where: { id: organizationX } }),
      ).toEqual(before);
    });

    it('never moves a role to another organization', async () => {
      const roleX = await getPrisma().role.create({
        data: { name: 'custom-x', workspaceId: workspaceX },
      });
      const roleY = await getPrisma().role.create({
        data: { name: 'custom-y', workspaceId: workspaceY },
      });
      const asOperatorY = <T>(fn: () => Promise<T>) =>
        TenantContext.runWithScope(
          scopeOf({ organizationId: organizationY, workspaceId: workspaceY }),
          fn,
        );
      const move = (id: string, workspaceId: string) => () =>
        scoped.client.role.update({ where: { id }, data: { workspaceId } });

      await expect(asClientA(move(roleX.id, workspaceY))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(asOperatorY(move(roleY.id, workspaceX))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      // Pulling another tenant's role into the own tenant finds no row to update.
      await expect(asOperatorY(move(roleX.id, workspaceY))).rejects.toThrow();
      await expect(
        TenantContext.runWithScope(scopeOf({}), move(roleX.id, workspaceX)),
      ).resolves.toMatchObject({ id: roleX.id, workspaceId: workspaceX });

      expect(await getPrisma().role.findUniqueOrThrow({ where: { id: roleX.id } })).toMatchObject({
        workspaceId: workspaceX,
      });
      expect(await getPrisma().role.findUniqueOrThrow({ where: { id: roleY.id } })).toMatchObject({
        workspaceId: workspaceY,
      });
    });

    it('refuses raw SQL through the scoped client unless it runs as system work', async () => {
      await expect(asClientA(() => scoped.client.$queryRaw`SELECT 1`)).rejects.toBeInstanceOf(
        TenantScopeError,
      );
      await expect(
        asClientA(() => scoped.client.$executeRawUnsafe('DELETE FROM "WorkspaceMember"')),
      ).rejects.toBeInstanceOf(TenantScopeError);
      await expect(
        TenantContext.runAsSystem(() => scoped.client.$queryRaw`SELECT 1`),
      ).resolves.toEqual([{ '?column?': 1 }]);
    });

    it('limits tenant roots to the own organization', async () => {
      const seen = await asClientA(async () => ({
        organizations: await scoped.client.organization.findMany(),
        workspaces: await scoped.client.workspace.findMany(),
        foreign: await scoped.client.workspace.findUnique({ where: { id: workspaceY } }),
      }));
      expect(seen.organizations.map((o) => o.id)).toEqual([organizationX]);
      expect(seen.workspaces.map((w) => w.id)).toEqual([workspaceX]);
      expect(seen.foreign).toBeNull();
    });

    it('refuses deletes that would cascade into scoped rows', async () => {
      const outsider = await getPrisma().user.findUniqueOrThrow({
        where: { email: USERS.opAdminY },
      });
      await expect(
        TenantContext.runWithScope(scopeOf({}), () =>
          scoped.client.user.delete({ where: { id: outsider.id } }),
        ),
      ).rejects.toBeInstanceOf(TenantScopeError);
      expect(await getPrisma().user.count({ where: { id: outsider.id } })).toBe(1);
    });

    it('refuses scoped models when no scope is set', async () => {
      await expect(
        TenantContext.run(async () => await scoped.client.workspaceMember.findMany()),
      ).rejects.toBeInstanceOf(TenantScopeError);
    });
  });

  describe('workspace-keyed models (roles, permissions, feature flags)', () => {
    const asOperatorX = <T>(fn: () => Promise<T>) => TenantContext.runWithScope(scopeOf({}), fn);
    const asOperatorY = <T>(fn: () => Promise<T>) =>
      TenantContext.runWithScope(
        scopeOf({ organizationId: organizationY, workspaceId: workspaceY }),
        fn,
      );

    it("never renames another organization's role reached by id", async () => {
      const roleX = await getPrisma().role.create({
        data: { name: 'keyed-x', workspaceId: workspaceX },
      });

      await expect(
        asOperatorY(() =>
          scoped.client.role.update({ where: { id: roleX.id }, data: { name: 'hijacked' } }),
        ),
      ).rejects.toThrow();
      await expect(
        asOperatorY(() =>
          scoped.client.role.updateMany({ where: { id: roleX.id }, data: { name: 'hijacked' } }),
        ),
      ).resolves.toEqual({ count: 0 });
      await expect(
        TenantContext.runWithScope(scopeOf({ clientId: CLIENT_A }), () =>
          scoped.client.role.update({ where: { id: roleX.id }, data: { name: 'hijacked' } }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(await getPrisma().role.findUniqueOrThrow({ where: { id: roleX.id } })).toMatchObject({
        name: 'keyed-x',
      });
    });

    it('reads global permissions but never writes them', async () => {
      const global = await getPrisma().permission.findFirstOrThrow({
        where: { workspaceId: null },
      });
      const customY = await getPrisma().permission.create({
        data: { key: 'custom:y', category: 'custom', workspaceId: workspaceY },
      });

      const seen = await asOperatorX(() => scoped.client.permission.findMany());
      expect(seen.some((p) => p.id === global.id)).toBe(true);
      expect(seen.some((p) => p.id === customY.id)).toBe(false);
      expect(seen.every((p) => p.workspaceId === null || p.workspaceId === workspaceX)).toBe(true);

      await expect(
        asOperatorX(() =>
          scoped.client.permission.update({
            where: { id: global.id },
            data: { description: 'hijacked' },
          }),
        ),
      ).rejects.toThrow();
      await expect(
        asOperatorX(() => scoped.client.permission.deleteMany({ where: { id: global.id } })),
      ).resolves.toEqual({ count: 0 });
      await expect(
        asOperatorX(() =>
          scoped.client.permission.create({
            data: { key: 'custom:global', category: 'custom', workspaceId: null },
          }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      const created = await asOperatorX(() =>
        scoped.client.permission.create({ data: { key: 'custom:x', category: 'custom' } }),
      );
      expect(created.workspaceId).toBe(workspaceX);

      expect(await getPrisma().permission.findUniqueOrThrow({ where: { id: global.id } })).toEqual(
        global,
      );
      expect(await getPrisma().permission.count({ where: { key: 'custom:global' } })).toBe(0);
    });

    it("never touches another workspace's feature flags", async () => {
      const flagX = await getPrisma().workspaceFeatureFlag.create({
        data: { workspaceId: workspaceX, key: 'beta:usage-graphs', enabled: false },
      });

      await expect(
        asOperatorY(() =>
          scoped.client.workspaceFeatureFlag.updateMany({ where: {}, data: { enabled: true } }),
        ),
      ).resolves.toEqual({ count: 0 });
      await expect(
        asOperatorY(() => scoped.client.workspaceFeatureFlag.deleteMany({ where: {} })),
      ).resolves.toEqual({ count: 0 });
      expect(
        await getPrisma().workspaceFeatureFlag.findUniqueOrThrow({ where: { id: flagX.id } }),
      ).toEqual(flagX);
      await getPrisma().workspaceFeatureFlag.delete({ where: { id: flagX.id } });
    });

    it("does not let a relation filter tell what another workspace's roles hold", async () => {
      // Every global permission is linked to the roles of workspace Y.
      const linkedToY = await getPrisma().permission.count({
        where: { workspaceId: null, roles: { some: { role: { workspaceId: workspaceY } } } },
      });
      expect(linkedToY).toBeGreaterThan(0);

      const probe = await asOperatorX(async () => ({
        permissions: await scoped.client.permission.findMany({
          where: { roles: { some: { role: { workspaceId: workspaceY } } } },
        }),
        links: await scoped.client.rolePermission.count({
          where: { role: { workspaceId: workspaceY } },
        }),
      }));
      expect(probe).toEqual({ permissions: [], links: 0 });
    });

    it('refuses a query naming another workspace, and caches nothing', async () => {
      const { RolesRepository } =
        require('../src/modules/rbac/repositories/roles.repository.interface') as typeof import('../src/modules/rbac/repositories/roles.repository.interface');
      const { FeatureFlagsService } =
        require('../src/modules/feature-flags/services/feature-flags.service') as typeof import('../src/modules/feature-flags/services/feature-flags.service');
      const { CacheService } =
        require('../src/shared/cache/cache.service') as typeof import('../src/shared/cache/cache.service');
      const set = jest.spyOn(app.get(CacheService), 'set');
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          await expect(
            asOperatorX(() => app.get(RolesRepository).findManyByWorkspace(workspaceY)),
          ).rejects.toBeInstanceOf(TenantScopeError);
          await expect(
            asOperatorX(() => app.get(FeatureFlagsService).getEffective(workspaceY)),
          ).rejects.toBeInstanceOf(TenantScopeError);
        }
        expect(set).not.toHaveBeenCalled();
      } finally {
        set.mockRestore();
      }
    });

    it('refuses nested writes into them, at any depth, and writes nothing', async () => {
      const prisma = getPrisma();
      const user = await prisma.user.findUniqueOrThrow({ where: { email: USERS.opAdminX } });
      const roleY = await prisma.role.findFirstOrThrow({ where: { workspaceId: workspaceY } });
      const roleX = await prisma.role.create({
        data: { name: 'keyed-nested', workspaceId: workspaceX },
      });
      const permission = await prisma.permission.findFirstOrThrow({
        where: { workspaceId: null },
      });
      const token = await prisma.emailVerifyToken.create({
        data: {
          userId: user.id,
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      const invitation = {
        email: 'nested@example.com',
        workspaceId: workspaceY,
        roleId: roleY.id,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
      };
      const invitationsBefore = await prisma.invitation.count();

      // The example from the issue, refused since the Invitation joined SCOPED_MODELS.
      await expect(
        asOperatorX(() =>
          scoped.client.user.update({
            where: { id: user.id },
            data: { invitationsSent: { create: invitation } },
          }),
        ),
      ).rejects.toBeInstanceOf(TenantScopeError);
      // The same write one level down, through two models with no tenant column.
      await expect(
        asOperatorX(() =>
          scoped.client.emailVerifyToken.update({
            where: { id: token.id },
            data: { user: { update: { invitationsSent: { create: invitation } } } },
          }),
        ),
      ).rejects.toBeInstanceOf(TenantScopeError);
      await expect(
        asOperatorX(() =>
          scoped.client.role.update({
            where: { id: roleX.id },
            data: { permissions: { create: { permissionId: permission.id } } },
          }),
        ),
      ).rejects.toBeInstanceOf(TenantScopeError);

      expect(await prisma.invitation.count()).toBe(invitationsBefore);
      expect(await prisma.rolePermission.count({ where: { roleId: roleX.id } })).toBe(0);
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

  describe('audit rows', () => {
    it('cannot be rewritten by deleting their organization', async () => {
      const prisma = getPrisma();
      const owner = await prisma.user.findUniqueOrThrow({ where: { email: USERS.opAdminY } });
      const lonely = await prisma.organization.create({
        data: { name: 'Lonely', slug: 'lonely', ownerId: owner.id },
      });
      const row = await prisma.auditLog.create({
        data: { action: 'scope.test.lonely', organizationId: lonely.id, hash: randomUUID() },
      });

      await expect(prisma.organization.delete({ where: { id: lonely.id } })).rejects.toThrow();
      expect(await prisma.auditLog.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
        organizationId: lonely.id,
        hash: row.hash,
      });
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
        SEED_INTERNAL_CLIENT_NAME: 'Seed Operator robots',
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

      const clients = await request(server)
        .get('/api/v1/clients')
        .set('Authorization', `Bearer ${token}`)
        .set('x-workspace-id', operator!.id)
        .expect(200);
      expect(clients.body).toEqual([
        expect.objectContaining({
          name: 'Seed Operator robots',
          status: 'active',
          isInternal: true,
        }),
      ]);
    });
  });
});
