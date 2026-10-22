import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { startTestDatabase, stopTestDatabase, resetDatabase } from './helpers/test-database';
import { seedPermissions } from './helpers/seed-permissions';
import type { TestEmailDispatcher } from './helpers/test-email-dispatcher';
import { registerAndVerify } from './helpers/auth-flow';
import { provisionOperator } from './helpers/operator';
import { provisionSuperAdmin } from './helpers/super-admin';

describe('Super admin fallback (e2e)', () => {
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

  async function registerAndLogin(email: string, name: string) {
    await registerAndVerify(server, emailDispatcher, {
      email,
      name,
      password: 'StrongPass@123',
    });
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: 'StrongPass@123' })
      .expect(200);
    return login.body.accessToken as string;
  }

  it('grants access to a workspace where the user is NOT a direct member', async () => {
    const ownerToken = await registerAndLogin('owner@example.com', 'Owner');
    await provisionOperator(app, 'owner@example.com');
    const ownerWs = await request(server)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const ownerWorkspaceId = ownerWs.body[0].id as string;

    const adminToken = await registerAndLogin('admin@example.com', 'Admin');
    const me = await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await provisionSuperAdmin(me.body.id as string);

    const refreshedMe = await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(refreshedMe.body.isSuperAdmin).toBe(true);

    await request(server)
      .get(`/api/v1/workspaces/${ownerWorkspaceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(server)
      .get('/api/v1/rbac/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-workspace-id', ownerWorkspaceId)
      .expect(200);
  });

  it('returns 403 for a regular user accessing another workspace', async () => {
    const ownerToken = await registerAndLogin('owner@example.com', 'Owner');
    await provisionOperator(app, 'owner@example.com');
    const ownerWs = await request(server)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const ownerWorkspaceId = ownerWs.body[0].id as string;

    const intruderToken = await registerAndLogin('intruder@example.com', 'Intruder');

    await request(server)
      .get(`/api/v1/workspaces/${ownerWorkspaceId}`)
      .set('Authorization', `Bearer ${intruderToken}`)
      .expect(403);
  });
});
