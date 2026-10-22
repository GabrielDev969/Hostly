import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { startTestDatabase, stopTestDatabase, resetDatabase } from './helpers/test-database';
import type { TestEmailDispatcher } from './helpers/test-email-dispatcher';
import { registerAndVerify } from './helpers/auth-flow';

describe('Sessions flow (e2e)', () => {
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
    emailDispatcher.reset();
  });

  async function loginTwice() {
    await registerAndVerify(server, emailDispatcher, {
      email: 'jane@example.com',
      name: 'Jane',
      password: 'StrongPass@123',
    });

    const a = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'jane@example.com', password: 'StrongPass@123' })
      .expect(200);
    const b = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'jane@example.com', password: 'StrongPass@123' })
      .expect(200);

    return {
      tokenA: a.body.accessToken as string,
      tokenB: b.body.accessToken as string,
    };
  }

  it('GET /sessions lists all active sessions of the current user', async () => {
    const { tokenA } = await loginTwice();

    const res = await request(server)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(res.body).toHaveLength(2);
  });

  it('DELETE /sessions/:id revokes one session', async () => {
    const { tokenA } = await loginTwice();

    const list = await request(server)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const targetId = list.body[0].id as string;

    await request(server)
      .delete(`/api/v1/auth/sessions/${targetId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(204);

    const after = await request(server)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(after.body).toHaveLength(1);
  });

  it('DELETE /sessions revokes all sessions of the current user', async () => {
    const { tokenA } = await loginTwice();

    await request(server)
      .delete('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(204);

    const after = await request(server)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(after.body.length).toBeLessThanOrEqual(1);
  });
});
