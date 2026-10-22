import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { startTestDatabase, stopTestDatabase, resetDatabase } from './helpers/test-database';
import { seedPermissions } from './helpers/seed-permissions';
import type { TestEmailDispatcher } from './helpers/test-email-dispatcher';
import { registerAndVerify } from './helpers/auth-flow';
import { provisionOperator } from './helpers/operator';

describe('Users CRUD (e2e)', () => {
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

  it('POST /users creates a user in the workspace and assigns a role', async () => {
    const { accessToken, workspaceId, staffRoleId } = await setup();

    const res = await request(server)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-workspace-id', workspaceId)
      .send({
        email: 'newbie@example.com',
        name: 'New Member',
        password: 'StrongPass@123',
        roleId: staffRoleId,
      })
      .expect(201);

    expect(res.body).toMatchObject({
      email: 'newbie@example.com',
      name: 'New Member',
    });
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('GET /users lists users in the workspace (paginated)', async () => {
    const { accessToken, workspaceId, staffRoleId } = await setup();

    await request(server)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-workspace-id', workspaceId)
      .send({
        email: 'a@example.com',
        name: 'Alice',
        password: 'StrongPass@123',
        roleId: staffRoleId,
      })
      .expect(201);

    const res = await request(server)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-workspace-id', workspaceId)
      .expect(200);

    expect(res.body.meta.total).toBe(2);
    expect(res.body.data.map((u: { email: string }) => u.email).sort()).toEqual([
      'a@example.com',
      'owner@example.com',
    ]);
  });

  it('PATCH /users/:id updates the name', async () => {
    const { accessToken, workspaceId, staffRoleId } = await setup();
    const created = await request(server)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-workspace-id', workspaceId)
      .send({
        email: 'a@example.com',
        name: 'Alice',
        password: 'StrongPass@123',
        roleId: staffRoleId,
      });
    const userId = created.body.id as string;

    const updated = await request(server)
      .patch(`/api/v1/users/${userId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-workspace-id', workspaceId)
      .send({ name: 'Renamed' })
      .expect(200);

    expect(updated.body.name).toBe('Renamed');
  });

  it('DELETE /users/:id forbids deleting the workspace owner', async () => {
    const { accessToken, workspaceId } = await setup();
    const me = await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    const ownerId = me.body.id as string;

    await request(server)
      .delete(`/api/v1/users/${ownerId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-workspace-id', workspaceId)
      .expect(403);
  });

  it('DELETE /users/:id soft-deletes a non-owner user', async () => {
    const { accessToken, workspaceId, staffRoleId } = await setup();
    const created = await request(server)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-workspace-id', workspaceId)
      .send({
        email: 'a@example.com',
        name: 'Alice',
        password: 'StrongPass@123',
        roleId: staffRoleId,
      });
    const userId = created.body.id as string;

    await request(server)
      .delete(`/api/v1/users/${userId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-workspace-id', workspaceId)
      .expect(204);

    await request(server)
      .get(`/api/v1/users/${userId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-workspace-id', workspaceId)
      .expect(404);
  });
});
