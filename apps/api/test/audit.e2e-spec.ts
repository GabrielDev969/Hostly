import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import {
  startTestDatabase,
  stopTestDatabase,
  resetDatabase,
  getPrisma,
} from './helpers/test-database';
import { seedPermissions } from './helpers/seed-permissions';
import type { TestEmailDispatcher } from './helpers/test-email-dispatcher';
import { registerAndVerify } from './helpers/auth-flow';
import { provisionOperator } from './helpers/operator';
import { provisionSuperAdmin } from './helpers/super-admin';

describe('Audit logs (e2e)', () => {
  let app: INestApplication;
  let server: App;
  let emailDispatcher: TestEmailDispatcher;

  beforeAll(async () => {
    await startTestDatabase();

    const { createTestApp } = require('./helpers/test-app') as typeof import('./helpers/test-app');
    ({ app, emailDispatcher } = await createTestApp());
    server = app.getHttpServer() as App;
  });

  afterAll(async () => {
    await app.close();
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedPermissions();
    emailDispatcher.reset();
  });

  async function setup() {
    await registerAndVerify(server, emailDispatcher, {
      email: 'owner@example.com',
      name: 'Owner',
      password: 'StrongPass@123',
    });
    await provisionOperator(app, 'owner@example.com');
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@example.com', password: 'StrongPass@123' })
      .expect(200);
    const accessToken = login.body.accessToken as string;

    const wsList = await request(server)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`);
    const workspaceId = wsList.body[0].id as string;

    const rolesRes = await request(server)
      .get('/api/v1/rbac/roles')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-workspace-id', workspaceId);
    const staffRoleId = (
      rolesRes.body.find((r: { name: string }) => r.name === 'operator_staff') as {
        id: string;
      }
    ).id;

    return { accessToken, workspaceId, staffRoleId };
  }

  it('records an audit log when a user is created', async () => {
    const { accessToken, workspaceId, staffRoleId } = await setup();

    await request(server)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-workspace-id', workspaceId)
      .send({
        email: 'newbie@example.com',
        name: 'Newbie',
        password: 'StrongPass@123',
        roleId: staffRoleId,
      })
      .expect(201);

    const res = await request(server)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-workspace-id', workspaceId)
      .query({ page: 1, limit: 10 })
      .expect(200);

    const actions = (res.body.data as { action: string }[]).map((l) => l.action);
    expect(actions).toContain('user.created');
    expect(res.body.meta.total).toBeGreaterThan(0);
  });

  it('filters audit logs by action prefix', async () => {
    const { accessToken, workspaceId, staffRoleId } = await setup();

    await request(server)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-workspace-id', workspaceId)
      .send({
        email: 'newbie@example.com',
        name: 'Newbie',
        password: 'StrongPass@123',
        roleId: staffRoleId,
      })
      .expect(201);

    const res = await request(server)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-workspace-id', workspaceId)
      .query({ page: 1, limit: 10, action: 'user.*' })
      .expect(200);

    expect(res.body.data.length).toBeGreaterThan(0);
    res.body.data.forEach((log: { action: string }) => {
      expect(log.action.startsWith('user.')).toBe(true);
    });
  });

  it('verifies a chain of version 2 rows with multi-key metadata', async () => {
    const { accessToken, workspaceId, staffRoleId } = await setup();
    const prisma = getPrisma();
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    await prisma.auditLog.deleteMany();

    // Version 2 rows with multi-key, nested metadata: JSONB hands the keys back in another order.
    const { AuditService } =
      require('../src/modules/audit/services/audit.service') as typeof import('../src/modules/audit/services/audit.service');
    const metadata = {
      zeta: 1,
      alpha: { method: 'POST', path: '/x', list: [{ b: 2, a: 1 }] },
      mid: 'm',
    };
    await app.get(AuditService).log({
      action: 'chained.event',
      workspaceId,
      organizationId: workspace.organizationId,
      clientId: 'client-a',
      metadata,
    });
    await request(server)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-workspace-id', workspaceId)
      .send({
        email: 'chained@example.com',
        name: 'Chained',
        password: 'StrongPass@123',
        roleId: staffRoleId,
      })
      .expect(201);

    const stored = await prisma.auditLog.findFirstOrThrow({ where: { action: 'chained.event' } });
    expect(stored.metadata).toEqual(metadata);
    expect(Object.keys(stored.metadata as object)).not.toEqual(Object.keys(metadata));
    const created = await prisma.auditLog.findFirstOrThrow({ where: { action: 'user.created' } });
    expect(Object.keys(created.metadata as object).length).toBeGreaterThan(1);
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@example.com' } });
    await provisionSuperAdmin(owner.id);

    const res = await request(server)
      .get('/api/v1/audit-logs/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-workspace-id', workspaceId)
      .expect(200);

    expect(res.body).toMatchObject({ valid: true, reason: 'ok', scanned: 2 });
    const rows = await prisma.auditLog.findMany();
    expect(rows.map((r) => r.hashVersion)).toEqual([2, 2]);
  });

  it('rejects a tampered chain downgraded to version 1', async () => {
    const { accessToken, workspaceId } = await setup();
    const prisma = getPrisma();
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@example.com' } });
    await provisionSuperAdmin(owner.id);
    const verify = () =>
      request(server)
        .get('/api/v1/audit-logs/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('x-workspace-id', workspaceId)
        .expect(200);
    expect((await verify()).body).toMatchObject({ valid: true });

    const { count } = await prisma.auditLog.updateMany({
      data: { action: 'tampered.event', hashVersion: 1 },
    });
    expect(count).toBeGreaterThan(0);

    expect((await verify()).body).toMatchObject({ valid: false, reason: 'bad_version' });
  });

  it('verifies rows whose metadata holds values with toJSON (Buffer, Decimal, Date)', async () => {
    const { accessToken, workspaceId } = await setup();
    const prisma = getPrisma();
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@example.com' } });
    await provisionSuperAdmin(owner.id);
    await prisma.auditLog.deleteMany();

    const { AuditService } =
      require('../src/modules/audit/services/audit.service') as typeof import('../src/modules/audit/services/audit.service');
    await app.get(AuditService).log({
      action: 'json.event',
      workspaceId,
      organizationId: workspace.organizationId,
      metadata: {
        blob: Buffer.from('audit'),
        amount: new Prisma.Decimal('10.50'),
        at: new Date('2026-01-01T00:00:00Z'),
      },
    });

    const res = await request(server)
      .get('/api/v1/audit-logs/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-workspace-id', workspaceId)
      .expect(200);

    expect(res.body).toMatchObject({ valid: true, scanned: 1, reason: 'ok' });
  });

  it('defaults hashVersion to the current formula for rows that omit it', async () => {
    const row = await getPrisma().auditLog.create({
      data: { action: 'defaulted.event', hash: randomUUID() },
    });
    expect(row.hashVersion).toBe(2);
  });
});
