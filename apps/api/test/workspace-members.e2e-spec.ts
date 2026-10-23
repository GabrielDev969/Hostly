import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { startTestDatabase, stopTestDatabase, resetDatabase } from './helpers/test-database';
import { seedPermissions } from './helpers/seed-permissions';
import type { TestEmailDispatcher } from './helpers/test-email-dispatcher';
import { registerAndVerify } from './helpers/auth-flow';
import { provisionOperator } from './helpers/operator';

interface JoinResult {
  workspaceId: string;
  memberId: string;
  accessToken: string;
}

describe('Workspace members (e2e)', () => {
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

  const PASSWORD = 'StrongPass@123';

  async function registerLogin(email: string, name: string): Promise<string> {
    await registerAndVerify(server, emailDispatcher, {
      email,
      name,
      password: PASSWORD,
    });
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return login.body.accessToken as string;
  }

  async function ownerSetup(): Promise<{
    ownerToken: string;
    workspaceId: string;
  }> {
    const ownerToken = await registerLogin('owner@example.com', 'Owner');
    await provisionOperator(app, 'owner@example.com');
    const wsList = await request(server)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`);
    return { ownerToken, workspaceId: wsList.body[0].id as string };
  }

  async function inviteAndAccept(
    ownerToken: string,
    workspaceId: string,
    email: string,
    name: string,
    roleName: 'operator_staff' | 'operator_admin' = 'operator_staff',
  ): Promise<JoinResult> {
    const rolesRes = await request(server)
      .get('/api/v1/rbac/roles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-workspace-id', workspaceId);
    const role = (rolesRes.body as { id: string; name: string }[]).find(
      (r) => r.name === roleName,
    ) as { id: string };

    await request(server)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-workspace-id', workspaceId)
      .send({ email, roleId: role.id })
      .expect(201);
    const token = emailDispatcher.tokenFor(email);

    const accessToken = await registerLogin(email, name);
    await request(server)
      .post('/api/v1/invitations/accept')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ token })
      .expect(200);

    const list = await request(server)
      .get(`/api/v1/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-workspace-id', workspaceId);
    const membership = (list.body as Array<{ id: string; user: { email: string } }>).find(
      (m) => m.user.email === email,
    ) as { id: string };

    return { workspaceId, memberId: membership.id, accessToken };
  }

  it('GET /workspaces/:id/members lists members with user + role', async () => {
    const { ownerToken, workspaceId } = await ownerSetup();
    await inviteAndAccept(ownerToken, workspaceId, 'b@example.com', 'Bob');

    const res = await request(server)
      .get(`/api/v1/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-workspace-id', workspaceId)
      .expect(200);

    expect(res.body).toHaveLength(2);
    const bob = (res.body as Array<{ user: { email: string }; role: { name: string } }>).find(
      (m) => m.user.email === 'b@example.com',
    );
    expect(bob?.role.name).toBe('operator_staff');
  });

  it('PATCH /workspaces/:id/members/:memberId changes the role', async () => {
    const { ownerToken, workspaceId } = await ownerSetup();
    const bob = await inviteAndAccept(ownerToken, workspaceId, 'b@example.com', 'Bob');

    const rolesRes = await request(server)
      .get('/api/v1/rbac/roles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-workspace-id', workspaceId);
    const adminRole = (rolesRes.body as { id: string; name: string }[]).find(
      (r) => r.name === 'operator_admin',
    ) as { id: string };

    await request(server)
      .patch(`/api/v1/workspaces/${workspaceId}/members/${bob.memberId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-workspace-id', workspaceId)
      .send({ roleId: adminRole.id })
      .expect(200);

    const list = await request(server)
      .get(`/api/v1/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-workspace-id', workspaceId);
    const bobMember = (list.body as Array<{ id: string; role: { name: string } }>).find(
      (m) => m.id === bob.memberId,
    );
    expect(bobMember?.role.name).toBe('operator_admin');
  });

  it('PATCH cannot modify the workspace owner (403)', async () => {
    const { ownerToken, workspaceId } = await ownerSetup();
    const list = await request(server)
      .get(`/api/v1/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-workspace-id', workspaceId);
    const ownerMember = list.body[0] as { id: string };

    const rolesRes = await request(server)
      .get('/api/v1/rbac/roles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-workspace-id', workspaceId);
    const adminRole = (rolesRes.body as { id: string; name: string }[]).find(
      (r) => r.name === 'operator_admin',
    ) as { id: string };

    await request(server)
      .patch(`/api/v1/workspaces/${workspaceId}/members/${ownerMember.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-workspace-id', workspaceId)
      .send({ roleId: adminRole.id })
      .expect(403);
  });

  it('DELETE removes a member; cannot remove owner', async () => {
    const { ownerToken, workspaceId } = await ownerSetup();
    const bob = await inviteAndAccept(ownerToken, workspaceId, 'b@example.com', 'Bob');

    await request(server)
      .delete(`/api/v1/workspaces/${workspaceId}/members/${bob.memberId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-workspace-id', workspaceId)
      .expect(204);

    const list = await request(server)
      .get(`/api/v1/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-workspace-id', workspaceId);
    expect(list.body).toHaveLength(1);

    const ownerMember = list.body[0] as { id: string };
    await request(server)
      .delete(`/api/v1/workspaces/${workspaceId}/members/${ownerMember.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-workspace-id', workspaceId)
      .expect(403);
  });

  it('DELETE allows self-leave for a member without remove_member permission', async () => {
    const { ownerToken, workspaceId } = await ownerSetup();
    const bob = await inviteAndAccept(ownerToken, workspaceId, 'b@example.com', 'Bob');

    await request(server)
      .delete(`/api/v1/workspaces/${workspaceId}/members/${bob.memberId}`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .set('x-workspace-id', workspaceId)
      .expect(204);
  });

  it('POST /transfer-ownership moves ownerId and both sides keep operator_admin', async () => {
    const { ownerToken, workspaceId } = await ownerSetup();
    const bob = await inviteAndAccept(ownerToken, workspaceId, 'b@example.com', 'Bob');

    await request(server)
      .post(`/api/v1/workspaces/${workspaceId}/transfer-ownership`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-workspace-id', workspaceId)
      .send({ targetMemberId: bob.memberId, password: PASSWORD })
      .expect(204);

    await new Promise((r) => setTimeout(r, 1100));

    const newOwnerLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'b@example.com', password: PASSWORD })
      .expect(200);
    const newOwnerToken = newOwnerLogin.body.accessToken as string;

    const list = await request(server)
      .get(`/api/v1/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${newOwnerToken}`)
      .set('x-workspace-id', workspaceId);

    const members = list.body as Array<{
      userId: string;
      user: { email: string };
      role: { name: string };
    }>;
    const byEmail = new Map(members.map((m) => [m.user.email, m]));
    expect(byEmail.get('b@example.com')?.role.name).toBe('operator_admin');
    expect(byEmail.get('owner@example.com')?.role.name).toBe('operator_admin');

    const ws = await request(server)
      .get(`/api/v1/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${newOwnerToken}`)
      .set('x-workspace-id', workspaceId)
      .expect(200);
    expect((ws.body as { ownerId: string }).ownerId).toBe(byEmail.get('b@example.com')?.userId);
  });

  it('POST /transfer-ownership rejects when password is wrong (401)', async () => {
    const { ownerToken, workspaceId } = await ownerSetup();
    const bob = await inviteAndAccept(ownerToken, workspaceId, 'b@example.com', 'Bob');

    await request(server)
      .post(`/api/v1/workspaces/${workspaceId}/transfer-ownership`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-workspace-id', workspaceId)
      .send({ targetMemberId: bob.memberId, password: 'WrongPass@123' })
      .expect(401);
  });

  it('POST /transfer-ownership rejects when caller is not the current owner (403)', async () => {
    const { ownerToken, workspaceId } = await ownerSetup();
    const bob = await inviteAndAccept(
      ownerToken,
      workspaceId,
      'b@example.com',
      'Bob',
      'operator_admin',
    );

    await request(server)
      .post(`/api/v1/workspaces/${workspaceId}/transfer-ownership`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .set('x-workspace-id', workspaceId)
      .send({ targetMemberId: bob.memberId, password: PASSWORD })
      .expect(403);
  });

  it('role change invalidates the target member existing access token', async () => {
    const { ownerToken, workspaceId } = await ownerSetup();
    const bob = await inviteAndAccept(ownerToken, workspaceId, 'b@example.com', 'Bob');

    await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(200);

    const rolesRes = await request(server)
      .get('/api/v1/rbac/roles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-workspace-id', workspaceId);
    const adminRole = (rolesRes.body as { id: string; name: string }[]).find(
      (r) => r.name === 'operator_admin',
    ) as { id: string };

    await request(server)
      .patch(`/api/v1/workspaces/${workspaceId}/members/${bob.memberId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-workspace-id', workspaceId)
      .send({ roleId: adminRole.id })
      .expect(200);

    await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(401);

    await new Promise((r) => setTimeout(r, 1100));

    const newLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'b@example.com', password: PASSWORD })
      .expect(200);

    await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${newLogin.body.accessToken}`)
      .expect(200);
  });
});
