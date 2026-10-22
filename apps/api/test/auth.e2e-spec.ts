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
import { provisionOperator } from './helpers/operator';
import { JwtService } from '@nestjs/jwt';
import { __TEST_JWT_KEYS__ } from './env';

describe('Auth flow (e2e)', () => {
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

  const credentials = {
    email: 'jane@example.com',
    name: 'Jane Doe',
    password: 'StrongPass@123',
  };

  it('POST /auth/v1/register creates a user without any workspace or organization', async () => {
    const res = await request(server).post('/api/v1/auth/register').send(credentials).expect(201);

    expect(res.body).toMatchObject({
      id: expect.any(String),
      email: credentials.email,
      name: credentials.name,
    });
    expect(res.body.passwordHash).toBeUndefined();

    const prisma = getPrisma();
    const userId = res.body.id as string;
    expect(await prisma.workspaceMember.count({ where: { userId } })).toBe(0);
    expect(await prisma.workspace.count({ where: { ownerId: userId } })).toBe(0);
    expect(await prisma.organization.count({ where: { ownerId: userId } })).toBe(0);
  });

  it('POST /auth/v1/register rejects duplicate email with 409', async () => {
    await request(server).post('/api/v1/auth/register').send(credentials).expect(201);
    await request(server).post('/api/v1/auth/register').send(credentials).expect(409);
  });

  it('POST /auth/v1/login returns access token and sets refresh cookie', async () => {
    await registerAndVerify(server, emailDispatcher, credentials);

    const res = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toBeUndefined();

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie).toBeDefined();
    const refreshCookie = setCookie.find((c) => c.startsWith('refresh_token='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('SameSite=Lax');
    expect(refreshCookie).toContain('Path=/api/v1/auth/refresh');
  });

  it('POST /auth/v1/login rejects wrong password with 401', async () => {
    await registerAndVerify(server, emailDispatcher, credentials);

    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: 'WrongPass@123' })
      .expect(401);
  });

  it('POST /auth/v1/login rejects unverified email with 403', async () => {
    await request(server).post('/api/v1/auth/register').send(credentials).expect(201);

    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(403);
  });

  it('GET /auth/v1/me returns profile, workspaces and isSuperAdmin=false', async () => {
    await registerAndVerify(server, emailDispatcher, credentials);

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);
    const auth = `Bearer ${login.body.accessToken}`;

    const before = await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', auth)
      .expect(200);
    expect(before.body.workspaces).toEqual([]);
    const workspacesBefore = await request(server)
      .get('/api/v1/workspaces')
      .set('Authorization', auth)
      .expect(200);
    expect(workspacesBefore.body).toEqual([]);

    const workspaceId = await provisionOperator(app, credentials.email, { name: 'Acme Malls' });

    const me = await request(server).get('/api/v1/auth/me').set('Authorization', auth).expect(200);

    expect(me.body).toMatchObject({
      email: credentials.email,
      name: credentials.name,
      twoFactorEnabled: false,
      isSuperAdmin: false,
    });
    expect(me.body.workspaces).toHaveLength(1);
    expect(me.body.workspaces[0]).toMatchObject({
      id: workspaceId,
      isPersonal: false,
      name: 'Acme Malls',
    });
  });

  it('GET /auth/v1/me without token returns 401', async () => {
    await request(server).get('/api/v1/auth/me').expect(401);
  });

  it('POST /auth/v1/logout revokes the session, clears the cookie, and invalidates refresh', async () => {
    await registerAndVerify(server, emailDispatcher, credentials);

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);

    const setCookie = login.headers['set-cookie'] as unknown as string[];
    const refreshCookie = setCookie.find((c) => c.startsWith('refresh_token=')) as string;
    const refreshValue = refreshCookie.split(';')[0]!.split('=')[1];

    const logout = await request(server)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(204);

    const logoutSetCookie = logout.headers['set-cookie'] as unknown as string[];
    expect(logoutSetCookie).toBeDefined();
    const cleared = logoutSetCookie.find((c) => c.startsWith('refresh_token=')) as string;
    expect(cleared).toContain('Path=/api/v1/auth/refresh');
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);

    await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refresh_token=${refreshValue}`)
      .expect(401);
  });

  it('access token is rejected with 401 after the session is revoked', async () => {
    await registerAndVerify(server, emailDispatcher, credentials);

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);

    await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    await request(server)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(204);

    await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(401);

    await request(server)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(401);
  });

  it('POST /auth/v1/logout without token returns 401', async () => {
    await request(server).post('/api/v1/auth/logout').expect(401);
  });

  it('audit log captures register, login success, login failure, and logout', async () => {
    const prisma = getPrisma();

    await registerAndVerify(server, emailDispatcher, credentials);

    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: 'WrongPass@123' })
      .expect(401);

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);

    await request(server)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(204);

    const expected = ['auth.register', 'auth.login.failure', 'auth.login.success', 'auth.logout'];
    let actions: string[] = [];
    for (let attempt = 0; attempt < 20; attempt++) {
      const logs = (await prisma.auditLog.findMany({
        orderBy: { createdAt: 'asc' },
      })) as Array<{ action: string }>;
      actions = logs.map((l) => l.action);
      if (expected.every((a) => actions.includes(a))) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(actions).toEqual(expect.arrayContaining(expected));
  });

  it('access tokens issued by /login carry the active kid in the JOSE header', async () => {
    await registerAndVerify(server, emailDispatcher, credentials);

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);

    const header = JSON.parse(
      Buffer.from((login.body.accessToken as string).split('.')[0]!, 'base64url').toString('utf8'),
    ) as { kid?: string; alg?: string };

    expect(header.alg).toBe('RS256');
    expect(header.kid).toBe(__TEST_JWT_KEYS__.currentKid);
  });

  it('an access token signed by a previous (overlap) kid still verifies', async () => {
    await registerAndVerify(server, emailDispatcher, credentials);

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);

    const payload = JSON.parse(
      Buffer.from((login.body.accessToken as string).split('.')[1]!, 'base64url').toString('utf8'),
    ) as { sub: string; sessionId: string };

    const previousPrivatePem = Buffer.from(
      __TEST_JWT_KEYS__.previousPrivateKeyBase64,
      'base64',
    ).toString('utf8');

    const { JWT_ISSUER, JWT_AUDIENCE } =
      require('../src/modules/auth/services/token.service') as typeof import('../src/modules/auth/services/token.service');
    const overlapToken = await new JwtService({}).signAsync(
      { sub: payload.sub, sessionId: payload.sessionId },
      {
        privateKey: previousPrivatePem,
        keyid: __TEST_JWT_KEYS__.previousKid,
        expiresIn: '15m',
        algorithm: 'RS256',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      },
    );

    await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${overlapToken}`)
      .expect(200);
  });

  it('an access token signed by an unknown kid is rejected with 401', async () => {
    await registerAndVerify(server, emailDispatcher, credentials);

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);

    const payload = JSON.parse(
      Buffer.from((login.body.accessToken as string).split('.')[1]!, 'base64url').toString('utf8'),
    ) as { sub: string; sessionId: string };

    const currentPrivatePem = Buffer.from(
      __TEST_JWT_KEYS__.currentPrivateKeyBase64,
      'base64',
    ).toString('utf8');

    const { JWT_ISSUER, JWT_AUDIENCE } =
      require('../src/modules/auth/services/token.service') as typeof import('../src/modules/auth/services/token.service');
    const rogue = await new JwtService({}).signAsync(
      { sub: payload.sub, sessionId: payload.sessionId },
      {
        privateKey: currentPrivatePem,
        keyid: 'not-in-the-map',
        expiresIn: '15m',
        algorithm: 'RS256',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      },
    );

    await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${rogue}`)
      .expect(401);
  });
});
