import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { brotliCompressSync, gzipSync } from 'zlib';
import { startTestDatabase, stopTestDatabase } from './helpers/test-database';

// No client sends a compressed body (#114), so the API refuses one before the body parser inflates it.
describe('Request body (e2e)', () => {
  let app: INestApplication;
  let server: App;

  const credentials = JSON.stringify({ email: 'nobody@example.com', password: 'secret-in-body' });
  // Superagent would JSON-encode a Buffer sent as application/json; this keeps the compressed bytes as they are.
  // Its typings want a string back, but it writes a Buffer to the socket untouched.
  const raw = (body: Buffer | string) => body as string;

  beforeAll(async () => {
    await startTestDatabase();

    const { createTestApp } = require('./helpers/test-app') as typeof import('./helpers/test-app');
    ({ app } = await createTestApp());
    server = app.getHttpServer() as App;
  });

  afterAll(async () => {
    await app.close();
    await stopTestDatabase();
  });

  // A second parser with Nest's defaults would inflate whatever the first one let through.
  it('mounts one JSON and one urlencoded parser', () => {
    const express = app.getHttpAdapter().getInstance() as {
      router: { stack: Array<{ name: string }> };
    };
    const names = express.router.stack.map((layer) => layer.name);

    expect(names.filter((name) => name === 'jsonParser')).toHaveLength(1);
    expect(names.filter((name) => name === 'urlencodedParser')).toHaveLength(1);
  });

  it.each([
    ['gzip', gzipSync(credentials)],
    ['br', brotliCompressSync(credentials)],
  ])('refuses a %s JSON body on login with 415', async (encoding, body) => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', encoding)
      .serialize(raw)
      .send(body)
      .expect(415);

    expect(res.body).toMatchObject({
      statusCode: 415,
      error: 'Unsupported Media Type',
      message: 'Unsupported content encoding',
    });
  });

  it('refuses a gzip JSON body on the public pairing route with 415', async () => {
    await request(server)
      .post('/api/v1/device/pair/start')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .serialize(raw)
      .send(gzipSync(JSON.stringify({ serial: 'FAKE-0001' })))
      .expect(415);
  });

  it('refuses a gzip urlencoded body with 415', async () => {
    await request(server)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('Content-Encoding', 'gzip')
      .serialize(raw)
      .send(gzipSync('email=nobody%40example.com&password=secret-in-body'))
      .expect(415);
  });

  it('still reads a plain JSON body', async () => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send(credentials);

    expect(res.status).toBe(401);
  });

  it('answers malformed JSON with 400 and never echoes the body', async () => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":"nobody@example.com","password":secret-in-body}')
      .expect(400);

    expect(res.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid request body',
    });
    expect(JSON.stringify(res.body)).not.toContain('secret-in-body');
  });

  it('answers a body over the limit with 413', async () => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'nobody@example.com', password: 'x'.repeat(200_000) }))
      .expect(413);

    expect(res.body).toMatchObject({
      statusCode: 413,
      error: 'Payload Too Large',
      message: 'Payload too large',
    });
  });
});
