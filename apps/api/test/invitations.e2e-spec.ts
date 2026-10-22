import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { startTestDatabase, stopTestDatabase, resetDatabase } from './helpers/test-database';
import { seedPermissions } from './helpers/seed-permissions';
import type { TestEmailDispatcher } from './helpers/test-email-dispatcher';
import { registerAndVerify } from './helpers/auth-flow';
import { provisionOperator } from './helpers/operator';

describe('Invitations flow (e2e)', () => {
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

  it('inviter sends → invitee accepts → invitee becomes member', async () => {
    const inviterToken = await registerAndLogin('inviter@example.com', 'Inviter');
    await provisionOperator(app, 'inviter@example.com');

    const wsList = await request(server)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${inviterToken}`)
      .expect(200);
    const workspaceId = wsList.body[0].id as string;

    const rolesRes = await request(server)
      .get('/api/v1/rbac/roles')
      .set('Authorization', `Bearer ${inviterToken}`)
      .set('x-workspace-id', workspaceId)
      .expect(200);
    const staffRole = rolesRes.body.find((r: { name: string }) => r.name === 'operator_staff') as {
      id: string;
    };
    expect(staffRole).toBeDefined();

    const inviteRes = await request(server)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${inviterToken}`)
      .set('x-workspace-id', workspaceId)
      .send({ email: 'invitee@example.com', roleId: staffRole.id })
      .expect(201);
    const token = inviteRes.body.token as string;
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    const inviteeToken = await registerAndLogin('invitee@example.com', 'Invitee');

    const acceptRes = await request(server)
      .post('/api/v1/invitations/accept')
      .set('Authorization', `Bearer ${inviteeToken}`)
      .send({ token })
      .expect(200);
    expect(acceptRes.body.workspaceId).toBe(workspaceId);

    const inviteeWorkspaces = await request(server)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${inviteeToken}`)
      .expect(200);
    const ids = (inviteeWorkspaces.body as { id: string }[]).map((w) => w.id);
    expect(ids).toEqual([workspaceId]);
  });

  it('rejects accept when logged-in email does not match the invitation', async () => {
    const inviterToken = await registerAndLogin('inviter@example.com', 'Inviter');
    await provisionOperator(app, 'inviter@example.com');

    const wsList = await request(server)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${inviterToken}`);
    const workspaceId = wsList.body[0].id as string;
    const rolesRes = await request(server)
      .get('/api/v1/rbac/roles')
      .set('Authorization', `Bearer ${inviterToken}`)
      .set('x-workspace-id', workspaceId);
    const staffRole = rolesRes.body.find((r: { name: string }) => r.name === 'operator_staff') as {
      id: string;
    };

    const inviteRes = await request(server)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${inviterToken}`)
      .set('x-workspace-id', workspaceId)
      .send({ email: 'invitee@example.com', roleId: staffRole.id })
      .expect(201);
    const token = inviteRes.body.token as string;

    const wrongUserToken = await registerAndLogin('wrong@example.com', 'Wrong User');

    await request(server)
      .post('/api/v1/invitations/accept')
      .set('Authorization', `Bearer ${wrongUserToken}`)
      .send({ token })
      .expect(403);
  });

  it('returns 409 when sending a duplicate pending invitation', async () => {
    const inviterToken = await registerAndLogin('inviter@example.com', 'Inviter');
    await provisionOperator(app, 'inviter@example.com');

    const wsList = await request(server)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${inviterToken}`);
    const workspaceId = wsList.body[0].id as string;
    const rolesRes = await request(server)
      .get('/api/v1/rbac/roles')
      .set('Authorization', `Bearer ${inviterToken}`)
      .set('x-workspace-id', workspaceId);
    const staffRole = rolesRes.body.find((r: { name: string }) => r.name === 'operator_staff') as {
      id: string;
    };

    await request(server)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${inviterToken}`)
      .set('x-workspace-id', workspaceId)
      .send({ email: 'invitee@example.com', roleId: staffRole.id })
      .expect(201);

    await request(server)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${inviterToken}`)
      .set('x-workspace-id', workspaceId)
      .send({ email: 'invitee@example.com', roleId: staffRole.id })
      .expect(409);
  });

  it('rejects inviting with a client-scoped role (400)', async () => {
    const inviterToken = await registerAndLogin('inviter@example.com', 'Inviter');
    const workspaceId = await provisionOperator(app, 'inviter@example.com');

    const rolesRes = await request(server)
      .get('/api/v1/rbac/roles')
      .set('Authorization', `Bearer ${inviterToken}`)
      .set('x-workspace-id', workspaceId)
      .expect(200);
    const clientAdminRole = rolesRes.body.find(
      (r: { name: string }) => r.name === 'client_admin',
    ) as {
      id: string;
    };
    expect(clientAdminRole).toBeDefined();

    const res = await request(server)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${inviterToken}`)
      .set('x-workspace-id', workspaceId)
      .send({ email: 'invitee@example.com', roleId: clientAdminRole.id })
      .expect(400);
    expect(res.body.message).toMatch(/client_admin requires a client membership/);
  });
});
