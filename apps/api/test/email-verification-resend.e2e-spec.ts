import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { Writable } from 'stream';
import { startTestDatabase, stopTestDatabase, resetDatabase } from './helpers/test-database';
import { seedPermissions } from './helpers/seed-permissions';
import type { TestEmailDispatcher } from './helpers/test-email-dispatcher';
import { registerAndVerify } from './helpers/auth-flow';
import { resetEmailVerificationLimits, waitForResendJobs } from './helpers/email-verification';

const RESEND = '/api/v1/auth/verify-email/resend';

describe('Public resend of the verification email (e2e)', () => {
  let app: INestApplication;
  let server: App;
  let emailDispatcher: TestEmailDispatcher;
  // What the app logs (pino, at trace level), to prove the verification token never reaches it.
  const logged: string[] = [];
  const logs = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      logged.push(chunk.toString('utf8'));
      callback();
    },
  });

  const unverified = {
    email: 'pending@example.com',
    name: 'Pending Person',
    password: 'StrongPass@123',
  };
  const verified = { email: 'done@example.com', name: 'Done Person', password: 'StrongPass@123' };

  beforeAll(async () => {
    await startTestDatabase();
    const { createTestApp } = require('./helpers/test-app') as typeof import('./helpers/test-app');
    ({ app, emailDispatcher } = await createTestApp({ logs }));
    server = app.getHttpServer() as App;
  });

  afterAll(async () => {
    await app.close();
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedPermissions();
    await resetEmailVerificationLimits();
    await request(server).post('/api/v1/auth/register').send(unverified).expect(201);
    await registerAndVerify(server, emailDispatcher, verified);
    emailDispatcher.reset();
  });

  const resend = (email: string) => request(server).post(RESEND).send({ email });

  it('answers the same for an unverified, an unknown and a verified email, and mails only the first', async () => {
    const answers = [];
    for (const email of [unverified.email, 'nobody@example.com', verified.email]) {
      const res = await resend(email).expect(204);
      answers.push({ status: res.status, body: res.text, type: res.headers['content-type'] });
    }
    expect(answers[1]).toEqual(answers[0]);
    expect(answers[2]).toEqual(answers[0]);

    await waitForResendJobs(app);
    expect(emailDispatcher.messages.map((m) => m.to)).toEqual([unverified.email]);
  });

  it('works without a session and normalizes the email', async () => {
    await resend('  Pending@Example.COM ').expect(204);
    await waitForResendJobs(app);
    expect(emailDispatcher.messages.map((m) => m.to)).toEqual([unverified.email]);

    // The session route is unchanged: still behind the bearer.
    await request(server).post('/api/v1/auth/verify-email/request').expect(401);
  });

  it('refuses an invalid email with 400 and queues nothing', async () => {
    await resend('not-an-email').expect(400);
    await waitForResendJobs(app);
    expect(emailDispatcher.messages).toHaveLength(0);
  });

  it('replaces the pending link, keeps the token out of the logs, and the new link lets the user in', async () => {
    await resend(unverified.email).expect(204);
    await waitForResendJobs(app);
    const first = emailDispatcher.tokenFor(unverified.email);
    await resend(unverified.email).expect(204);
    await waitForResendJobs(app);
    const second = emailDispatcher.tokenFor(unverified.email);
    expect(second).not.toBe(first);
    expect(logged.join('')).not.toContain(first);
    expect(logged.join('')).not.toContain(second);

    await request(server).post('/api/v1/auth/verify-email').send({ token: first }).expect(400);
    await request(server).post('/api/v1/auth/verify-email').send({ token: second }).expect(204);
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: unverified.email, password: unverified.password })
      .expect(200);
  });

  it('allows 3 resends per email in the window, with the same 429 for an existing and an unknown email', async () => {
    const tooMany = [];
    for (const email of [unverified.email, 'nobody@example.com']) {
      for (let i = 0; i < 3; i++) await resend(email).expect(204);
      const res = await resend(email).expect(429);
      tooMany.push(res.body as Record<string, unknown>);
    }
    const [existing, unknown] = tooMany.map(({ statusCode, error, message }) => ({
      statusCode,
      error,
      message,
    }));
    expect(existing).toEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Too many requests; try again later',
    });
    expect(unknown).toEqual(existing);

    await waitForResendJobs(app);
    expect(emailDispatcher.messages.filter((m) => m.to === unverified.email)).toHaveLength(3);
  });

  it('allows 10 resends per IP in the window, whatever the emails, and refuses the 11th', async () => {
    const emails = [
      unverified.email,
      verified.email,
      ...Array.from({ length: 8 }, (_, i) => `u${i}@example.com`),
    ];
    for (const email of emails) await resend(email).expect(204);

    const res = await resend('fresh@example.com').expect(429);
    expect((res.body as { message: string }).message).toBe('Too many requests; try again later');
    await resend(unverified.email).expect(429);

    await waitForResendJobs(app);
    expect(emailDispatcher.messages.map((m) => m.to)).toEqual([unverified.email]);
  });
});
