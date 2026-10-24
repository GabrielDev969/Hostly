import { INestApplication } from '@nestjs/common';
import http from 'http';
import type { AddressInfo } from 'net';
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

  // The guard reads x-workspace-id before :workspaceId, so a static segment would reach the handler.
  it('GET /workspaces/features no longer answers the workspace', async () => {
    const { accessToken } = await registerAndLogin();
    const workspaceId = await provisionOperator(app, 'jane@example.com');

    const res = await request(server)
      .get('/api/v1/workspaces/features')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-workspace-id', workspaceId)
      .expect(400);

    expect(res.body).not.toHaveProperty('slug');
    expect(res.body).not.toHaveProperty('ownerId');
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

  describe('x-workspace-id and :workspaceId disagree', () => {
    const MISMATCH = 'x-workspace-id does not match the workspace in the URL';

    // Jane owns A, Bob owns B and is not a member of A, root is a super admin of neither.
    async function twoWorkspaces() {
      const jane = await registerAndLogin();
      const a = await provisionOperator(app, 'jane@example.com', { name: 'Workspace A' });
      const bob = await registerAndLogin({ email: 'bob@example.com', name: 'Bob' });
      const b = await provisionOperator(app, 'bob@example.com', { name: 'Workspace B' });
      const root = await superAdminToken();
      return {
        a,
        b,
        tokens: { jane: jane.accessToken, bob: bob.accessToken, root },
      };
    }

    async function expectUntouched(a: string, b: string) {
      const rows = await getPrisma().workspace.findMany({
        where: { id: { in: [a, b] } },
        select: { id: true, name: true, deletedAt: true },
      });
      expect(rows).toEqual(
        expect.arrayContaining([
          { id: a, name: 'Workspace A', deletedAt: null },
          { id: b, name: 'Workspace B', deletedAt: null },
        ]),
      );
      expect(rows).toHaveLength(2);
      const audits = await getPrisma().auditLog.count({
        where: { action: { in: ['workspace.updated', 'workspace.deleted'] } },
      });
      expect(audits).toBe(0);
    }

    it.each(['jane', 'bob', 'root'] as const)(
      'PATCH /workspaces/A with header B is refused for %s before any membership check',
      async (who) => {
        const { a, b, tokens } = await twoWorkspaces();

        const res = await request(server)
          .patch(`/api/v1/workspaces/${a}`)
          .set('Authorization', `Bearer ${tokens[who]}`)
          .set('x-workspace-id', b)
          .send({ name: 'Renamed via A' })
          .expect(400);

        expect(res.body.message).toBe(MISMATCH);
        await expectUntouched(a, b);
      },
    );

    it.each(['bob', 'root'] as const)(
      'DELETE /workspaces/A with header B is refused for %s',
      async (who) => {
        const { a, b, tokens } = await twoWorkspaces();

        const res = await request(server)
          .delete(`/api/v1/workspaces/${a}`)
          .set('Authorization', `Bearer ${tokens[who]}`)
          .set('x-workspace-id', b)
          .expect(400);

        expect(res.body.message).toBe(MISMATCH);
        await expectUntouched(a, b);
      },
    );

    // Superagent only types an array header for Cookie, so the repeated header goes through http.request.
    function getWithRepeatedHeader(path: string, token: string, values: string[]): Promise<number> {
      const { port } = (app.getHttpServer() as http.Server).address() as AddressInfo;
      return new Promise((resolve, reject) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port,
            path,
            headers: { Authorization: `Bearer ${token}`, 'x-workspace-id': values },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          },
        );
        req.on('error', reject);
        req.end();
      });
    }

    // Node joins a repeated header into "A, B", which is not a UUID.
    it('refuses a repeated x-workspace-id header', async () => {
      const { a, b, tokens } = await twoWorkspaces();

      expect(await getWithRepeatedHeader('/api/v1/clients', tokens.jane, [a, b])).toBe(400);
      expect(await getWithRepeatedHeader('/api/v1/clients', tokens.jane, [a, a])).toBe(400);
      expect(await getWithRepeatedHeader('/api/v1/clients', tokens.jane, [a])).toBe(200);
    });

    it('still accepts the path alone, the header alone and both equal', async () => {
      const { a, tokens } = await twoWorkspaces();
      const auth = { Authorization: `Bearer ${tokens.jane}` };

      await request(server)
        .patch(`/api/v1/workspaces/${a}`)
        .set(auth)
        .send({ name: 'Path only' })
        .expect(200);
      await request(server)
        .patch(`/api/v1/workspaces/${a}`)
        .set(auth)
        .set('x-workspace-id', a)
        .send({ name: 'Both equal' })
        .expect(200);
      await request(server).get('/api/v1/clients').set(auth).set('x-workspace-id', a).expect(200);

      const workspace = await getPrisma().workspace.findUniqueOrThrow({ where: { id: a } });
      expect(workspace.name).toBe('Both equal');
    });
  });
});
