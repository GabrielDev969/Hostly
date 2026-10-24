import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  startTestDatabase,
  stopTestDatabase,
  resetDatabase,
  getPrisma,
} from './helpers/test-database';
import { seedPermissions } from './helpers/seed-permissions';
import type { TestEmailDispatcher } from './helpers/test-email-dispatcher';
import { registerAndVerify } from './helpers/auth-flow';
import { ADMIN_WORKSPACE_SLUG, SUPER_ADMIN_ROLE } from '../src/modules/rbac/constants/system';

describe('Admin: invalidate user tokens (e2e)', () => {
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

  async function registerAndLogin(email: string, name: string): Promise<string> {
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

  async function provisionSuperAdmin(userId: string): Promise<void> {
    const prisma = getPrisma();
    const organization = await prisma.organization.create({
      data: {
        name: 'System Administration',
        slug: `org-${ADMIN_WORKSPACE_SLUG}`,
        ownerId: userId,
      },
    });
    const adminWs = await prisma.workspace.create({
      data: {
        name: 'System Administration',
        slug: ADMIN_WORKSPACE_SLUG,
        isPersonal: false,
        ownerId: userId,
        organizationId: organization.id,
      },
    });
    const allPerms = await prisma.permission.findMany();
    const role = await prisma.role.create({
      data: {
        name: SUPER_ADMIN_ROLE,
        description: 'Global access',
        workspaceId: adminWs.id,
        isSystem: true,
        permissions: {
          create: allPerms.map((p) => ({ permissionId: p.id })),
        },
      },
    });
    await prisma.workspaceMember.create({
      data: {
        userId,
        workspaceId: adminWs.id,
        organizationId: adminWs.organizationId,
        roleId: role.id,
      },
    });
  }

  it('rejects 403 for non super-admin', async () => {
    const ownerToken = await registerAndLogin('owner@example.com', 'Owner');
    const me = await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    await request(server)
      .post(`/api/v1/admin/users/${me.body.id}/invalidate-tokens`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(403);
  });

  it('super-admin invalidates a user — their existing access token is rejected, new login works', async () => {
    const adminToken = await registerAndLogin('admin@example.com', 'Admin');
    const adminMe = await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await provisionSuperAdmin(adminMe.body.id as string);

    const userToken = await registerAndLogin('jane@example.com', 'Jane');
    const userMe = await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    await request(server)
      .post(`/api/v1/admin/users/${userMe.body.id}/invalidate-tokens`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(401);

    await new Promise((r) => setTimeout(r, 1100));

    const newLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'jane@example.com', password: 'StrongPass@123' })
      .expect(200);

    await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${newLogin.body.accessToken}`)
      .expect(200);
  });

  it('orders the access token against the invalidation by millisecond, not by second', async () => {
    const token = await registerAndLogin('jane@example.com', 'Jane');
    const { iatMs } = JSON.parse(
      Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'),
    ) as { iatMs: number };
    const me = () => request(server).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    // Loaded lazily like the app: importing it at the top would parse env before the container exists.
    const { CacheService } =
      require('../src/shared/cache/cache.service') as typeof import('../src/shared/cache/cache.service');
    const { CACHE_NS } =
      require('../src/shared/cache/cache.constants') as typeof import('../src/shared/cache/cache.constants');
    // Written straight to the row to pick the instant, so drop the cached value as invalidateTokens does.
    const invalidateAt = async (ms: number) => {
      await getPrisma().user.update({
        where: { email: 'jane@example.com' },
        data: { tokensInvalidatedAt: new Date(ms) },
      });
      await app.get(CacheService).bumpNamespace(CACHE_NS.users);
    };

    // Issued right after the invalidation, usually in the same second: still valid.
    await invalidateAt(iatMs - 1);
    await me().expect(200);

    // Issued in the very millisecond of the invalidation: refused.
    await invalidateAt(iatMs);
    await me().expect(401);
  });

  it('returns 404 when target user does not exist', async () => {
    const adminToken = await registerAndLogin('admin@example.com', 'Admin');
    const adminMe = await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await provisionSuperAdmin(adminMe.body.id as string);

    await request(server)
      .post('/api/v1/admin/users/00000000-0000-0000-0000-000000000000/invalidate-tokens')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
