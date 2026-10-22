import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { startTestDatabase, stopTestDatabase, resetDatabase } from './helpers/test-database';
import { seedPermissions } from './helpers/seed-permissions';
import type { TestEmailDispatcher } from './helpers/test-email-dispatcher';
import { registerAndVerify } from './helpers/auth-flow';
import { provisionOperator } from './helpers/operator';
import { provisionSuperAdmin } from './helpers/super-admin';

describe('Workspaces flow (e2e)', () => {
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

  async function registerAndLogin(
    overrides: Partial<{ email: string; name: string; password: string }> = {},
  ) {
    const credentials = {
      email: overrides.email ?? 'jane@example.com',
      name: overrides.name ?? 'Jane Doe',
      password: overrides.password ?? 'StrongPass@123',
    };
    await registerAndVerify(server, emailDispatcher, credentials);

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);

    return { credentials, accessToken: login.body.accessToken as string };
  }

  async function superAdminToken(): Promise<string> {
    const { accessToken } = await registerAndLogin({ email: 'root@example.com', name: 'Root' });
    const me = await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await provisionSuperAdmin(me.body.id as string);
    return accessToken;
  }

  it('GET /workspaces returns the operator workspace provisioned for the owner', async () => {
    const { accessToken } = await registerAndLogin();
    const workspaceId = await provisionOperator(app, 'jane@example.com', { name: 'Acme Malls' });

    const res = await request(server)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: workspaceId,
      isPersonal: false,
      name: 'Acme Malls',
    });
  });

  it('GET /workspaces/:id returns the workspace when the user is a member', async () => {
    const { accessToken } = await registerAndLogin();
    await provisionOperator(app, 'jane@example.com');
    const list = await request(server)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const workspaceId = list.body[0].id as string;

    const res = await request(server)
      .get(`/api/v1/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.id).toBe(workspaceId);
  });

  it('GET /workspaces/:id returns 403 when user is not a member', async () => {
    const a = await registerAndLogin();
    await provisionOperator(app, 'jane@example.com');
    const b = await registerAndLogin({ email: 'bob@example.com', name: 'Bob' });

    const aList = await request(server)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(200);
    const aWorkspaceId = aList.body[0].id as string;

    await request(server)
      .get(`/api/v1/workspaces/${aWorkspaceId}`)
      .set('Authorization', `Bearer ${b.accessToken}`)
      .expect(403);
  });

  it('DELETE /workspaces/:id is forbidden to operator_admin (no workspace:delete)', async () => {
    const { accessToken } = await registerAndLogin();
    const workspaceId = await provisionOperator(app, 'jane@example.com');

    const res = await request(server)
      .delete(`/api/v1/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(res.body.message).toMatch(/workspace:delete/);
  });

  it('DELETE /workspaces/:id forbids deleting personal workspaces, even for a super admin', async () => {
    await registerAndLogin();
    const workspaceId = await provisionOperator(app, 'jane@example.com', { isPersonal: true });
    const rootToken = await superAdminToken();

    const res = await request(server)
      .delete(`/api/v1/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${rootToken}`)
      .expect(403);

    expect(res.body.message).toMatch(/personal/i);
  });

  it('DELETE /workspaces/:id lets a super admin soft-delete an operator workspace', async () => {
    const { accessToken } = await registerAndLogin();
    const workspaceId = await provisionOperator(app, 'jane@example.com');
    const rootToken = await superAdminToken();

    await request(server)
      .delete(`/api/v1/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${rootToken}`)
      .expect(204);

    const list = await request(server)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(list.body).toEqual([]);
  });
});
