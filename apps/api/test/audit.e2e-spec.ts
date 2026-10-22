import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { startTestDatabase, stopTestDatabase, resetDatabase } from './helpers/test-database';
import { seedPermissions } from './helpers/seed-permissions';
import type { TestEmailDispatcher } from './helpers/test-email-dispatcher';
import { registerAndVerify } from './helpers/auth-flow';
import { provisionOperator } from './helpers/operator';

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
});
