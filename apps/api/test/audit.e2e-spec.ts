import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createHash, randomUUID } from 'crypto';
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

  it('verifies a chain of an old-formula row and version 2 rows with multi-key metadata', async () => {
    const { accessToken, workspaceId, staffRoleId } = await setup();
    const prisma = getPrisma();
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    await prisma.auditLog.deleteMany();

    // A row written before tenant_scope: hashVersion 1, then organizationId backfilled by the migration.
    const legacy = {
      id: randomUUID(),
      userId: null,
      workspaceId,
      action: 'legacy.event',
      resource: null,
      resourceId: null,
      metadata: null,
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(Date.now() - 60_000),
    };
    const legacyHash = createHash('sha256')
      .update(
        JSON.stringify({
          prevHash: null,
          id: legacy.id,
          userId: legacy.userId,
          workspaceId: legacy.workspaceId,
          action: legacy.action,
          resource: legacy.resource,
          resourceId: legacy.resourceId,
          metadata: legacy.metadata,
          ipAddress: legacy.ipAddress,
          userAgent: legacy.userAgent,
          createdAt: legacy.createdAt.toISOString(),
        }),
      )
      .digest('hex');
    await prisma.auditLog.create({
      data: {
        ...legacy,
        metadata: undefined,
        organizationId: workspace.organizationId,
        prevHash: null,
        hash: legacyHash,
        hashVersion: 1,
      },
    });

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

    expect(res.body).toMatchObject({ valid: true, reason: 'ok' });
    expect(res.body.scanned).toBe(3);
    const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => r.hashVersion)).toEqual([1, ...rows.slice(1).map(() => 2)]);
  });
});
