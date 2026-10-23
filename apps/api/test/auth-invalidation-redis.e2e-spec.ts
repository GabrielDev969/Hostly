import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  getPrisma,
  resetDatabase,
  startTestDatabase,
  stopTestDatabase,
} from './helpers/test-database';
import { seedPermissions } from './helpers/seed-permissions';
import type { TestEmailDispatcher } from './helpers/test-email-dispatcher';
import { registerAndVerify } from './helpers/auth-flow';
import { addScopedMember, provisionOperator } from './helpers/operator';
import { provisionSuperAdmin } from './helpers/super-admin';

// Every flow that invalidates tokens, with the cache in Redis as in production: once the user logs in again,
// /auth/me answers 200 on every call, from the database or from the cache, and the old token stays refused.
describe('Token invalidation with the Redis cache (e2e)', () => {
  let app: INestApplication;
  let server: App;
  let emailDispatcher: TestEmailDispatcher;

  beforeAll(async () => {
    await startTestDatabase();
    const { createTestApp } = require('./helpers/test-app') as typeof import('./helpers/test-app');
    ({ app, emailDispatcher } = await createTestApp({ redisCache: true }));
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

  async function login(email: string, password = PASSWORD): Promise<string> {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return res.body.accessToken as string;
  }

  async function registerLogin(email: string, name: string): Promise<string> {
    await registerAndVerify(server, emailDispatcher, { email, name, password: PASSWORD });
    return login(email);
  }

  async function meStatuses(token: string, times = 3): Promise<number[]> {
    const statuses: number[] = [];
    for (let i = 0; i < times; i++) {
      const res = await request(server)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);
      statuses.push(res.status);
    }
    return statuses;
  }

  async function operatorWithStaff(): Promise<{
    ownerToken: string;
    workspaceId: string;
    staffMemberId: string;
  }> {
    const ownerToken = await registerLogin('owner@example.com', 'Owner');
    const workspaceId = await provisionOperator(app, 'owner@example.com');
    await registerAndVerify(server, emailDispatcher, {
      email: 'bob@example.com',
      name: 'Bob',
      password: PASSWORD,
    });
    await addScopedMember(workspaceId, 'bob@example.com', 'operator_staff', {
      clientId: null,
      advertiserId: null,
    });
    const staff = await getPrisma().workspaceMember.findFirstOrThrow({
      where: { workspaceId, user: { email: 'bob@example.com' } },
    });
    return { ownerToken, workspaceId, staffMemberId: staff.id };
  }

  it('password reset', async () => {
    const oldToken = await registerLogin('jane@example.com', 'Jane');
    expect(await meStatuses(oldToken)).toEqual([200, 200, 200]);

    await request(server)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'jane@example.com' })
      .expect(204);
    await request(server)
      .post('/api/v1/auth/reset-password')
      .send({ token: emailDispatcher.tokenFor('jane@example.com'), newPassword: 'Fresh#Garden82' })
      .expect(204);

    expect(await meStatuses(oldToken)).toEqual([401, 401, 401]);
    const newToken = await login('jane@example.com', 'Fresh#Garden82');
    expect(await meStatuses(newToken)).toEqual([200, 200, 200]);
  });

  it('role change', async () => {
    const { ownerToken, workspaceId, staffMemberId } = await operatorWithStaff();
    const oldToken = await login('bob@example.com');
    const adminRole = await getPrisma().role.findUniqueOrThrow({
      where: { workspaceId_name: { workspaceId, name: 'operator_admin' } },
    });

    await request(server)
      .patch(`/api/v1/workspaces/${workspaceId}/members/${staffMemberId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-workspace-id', workspaceId)
      .send({ roleId: adminRole.id })
      .expect(200);

    expect(await meStatuses(oldToken)).toEqual([401, 401, 401]);
    const newToken = await login('bob@example.com');
    expect(await meStatuses(newToken)).toEqual([200, 200, 200]);
  });

  it('ownership transfer, on both sides', async () => {
    const { ownerToken, workspaceId, staffMemberId } = await operatorWithStaff();
    const oldTargetToken = await login('bob@example.com');

    await request(server)
      .post(`/api/v1/workspaces/${workspaceId}/transfer-ownership`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-workspace-id', workspaceId)
      .send({ targetMemberId: staffMemberId, password: PASSWORD })
      .expect(204);

    for (const [email, oldToken] of [
      ['owner@example.com', ownerToken],
      ['bob@example.com', oldTargetToken],
    ] as const) {
      expect(await meStatuses(oldToken)).toEqual([401, 401, 401]);
      const newToken = await login(email);
      expect(await meStatuses(newToken)).toEqual([200, 200, 200]);
    }
  });

  it('invalidation by the super admin', async () => {
    const adminToken = await registerLogin('admin@example.com', 'Admin');
    const admin = await getPrisma().user.findUniqueOrThrow({
      where: { email: 'admin@example.com' },
    });
    await provisionSuperAdmin(admin.id);
    const oldToken = await registerLogin('jane@example.com', 'Jane');
    const jane = await getPrisma().user.findUniqueOrThrow({ where: { email: 'jane@example.com' } });

    await request(server)
      .post(`/api/v1/admin/users/${jane.id}/invalidate-tokens`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    expect(await meStatuses(oldToken)).toEqual([401, 401, 401]);
    const newToken = await login('jane@example.com');
    expect(await meStatuses(newToken)).toEqual([200, 200, 200]);
  });
});
