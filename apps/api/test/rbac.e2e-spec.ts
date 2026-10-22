import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { startTestDatabase, stopTestDatabase, resetDatabase } from './helpers/test-database';
import { seedPermissions } from './helpers/seed-permissions';
import type { TestEmailDispatcher } from './helpers/test-email-dispatcher';
import { registerAndVerify } from './helpers/auth-flow';
import { provisionOperator } from './helpers/operator';

describe('RBAC roles flow (e2e)', () => {
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

    const ws = await request(server)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const workspaceId = ws.body[0].id as string;

    return { accessToken, workspaceId };
  }

  it('creates, updates and deletes a custom role', async () => {
    const { accessToken, workspaceId } = await setup();
    const auth = `Bearer ${accessToken}`;

    const created = await request(server)
      .post('/api/v1/rbac/roles')
      .set('Authorization', auth)
      .set('x-workspace-id', workspaceId)
      .send({
        name: 'Editor',
        description: 'Edits content',
        permissionKeys: ['user:read'],
      })
      .expect(201);

    const roleId = created.body.id as string;
    expect(created.body.isSystem).toBe(false);
    expect(created.body.permissions).toHaveLength(1);

    const renamed = await request(server)
      .patch(`/api/v1/rbac/roles/${roleId}`)
      .set('Authorization', auth)
      .set('x-workspace-id', workspaceId)
      .send({ name: 'Senior Editor' })
      .expect(200);
    expect(renamed.body.name).toBe('Senior Editor');

    await request(server)
      .delete(`/api/v1/rbac/roles/${roleId}`)
      .set('Authorization', auth)
      .set('x-workspace-id', workspaceId)
      .expect(204);
  });

  it('assigns a permission idempotently', async () => {
    const { accessToken, workspaceId } = await setup();
    const auth = `Bearer ${accessToken}`;

    const created = await request(server)
      .post('/api/v1/rbac/roles')
      .set('Authorization', auth)
      .set('x-workspace-id', workspaceId)
      .send({ name: 'Reader', permissionKeys: ['user:read'] })
      .expect(201);
    const roleId = created.body.id as string;

    const first = await request(server)
      .post(`/api/v1/rbac/roles/${roleId}/permissions`)
      .set('Authorization', auth)
      .set('x-workspace-id', workspaceId)
      .send({ permissionKey: 'workspace:read' })
      .expect(200);
    expect(first.body.permissions).toHaveLength(2);

    const second = await request(server)
      .post(`/api/v1/rbac/roles/${roleId}/permissions`)
      .set('Authorization', auth)
      .set('x-workspace-id', workspaceId)
      .send({ permissionKey: 'workspace:read' })
      .expect(200);
    expect(second.body.permissions).toHaveLength(2);
  });

  it('forbids modifying or deleting system roles', async () => {
    const { accessToken, workspaceId } = await setup();
    const auth = `Bearer ${accessToken}`;

    const list = await request(server)
      .get('/api/v1/rbac/roles')
      .set('Authorization', auth)
      .set('x-workspace-id', workspaceId)
      .expect(200);
    const adminRole = (list.body as { id: string; name: string }[]).find(
      (r) => r.name === 'operator_admin',
    );
    expect(adminRole).toBeDefined();

    await request(server)
      .patch(`/api/v1/rbac/roles/${adminRole!.id}`)
      .set('Authorization', auth)
      .set('x-workspace-id', workspaceId)
      .send({ name: 'Hacked' })
      .expect(403);

    await request(server)
      .delete(`/api/v1/rbac/roles/${adminRole!.id}`)
      .set('Authorization', auth)
      .set('x-workspace-id', workspaceId)
      .expect(403);
  });

  it('rejects creating a role with a duplicate name', async () => {
    const { accessToken, workspaceId } = await setup();
    const auth = `Bearer ${accessToken}`;

    await request(server)
      .post('/api/v1/rbac/roles')
      .set('Authorization', auth)
      .set('x-workspace-id', workspaceId)
      .send({ name: 'operator_admin', permissionKeys: ['user:read'] })
      .expect(409);
  });
});
