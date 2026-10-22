import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { startTestDatabase, stopTestDatabase, resetDatabase } from './helpers/test-database';
import { seedPermissions } from './helpers/seed-permissions';
import type { TestEmailDispatcher } from './helpers/test-email-dispatcher';
import { registerAndVerify } from './helpers/auth-flow';

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

  it('GET /workspaces returns the personal workspace created on register', async () => {
    const { accessToken } = await registerAndLogin();

    const res = await request(server)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      isPersonal: true,
      name: "Jane Doe's Workspace",
    });
  });

  it('GET /workspaces/:id returns the workspace when the user is a member', async () => {
    const { accessToken } = await registerAndLogin();
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

  it('DELETE /workspaces/:id forbids deleting personal workspaces', async () => {
    const { accessToken } = await registerAndLogin();
    const list = await request(server)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const workspaceId = list.body[0].id as string;

    const res = await request(server)
      .delete(`/api/v1/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(res.body.message).toMatch(/personal/i);
  });
});
