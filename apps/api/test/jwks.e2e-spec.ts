import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { startTestDatabase, stopTestDatabase } from './helpers/test-database';
import { __TEST_JWT_KEYS__ } from './env';

describe('JWKS (e2e)', () => {
  let app: INestApplication;
  let server: App;

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

  it('GET /.well-known/jwks.json is publicly reachable and returns every configured kid', async () => {
    const res = await request(server).get('/.well-known/jwks.json').expect(200);

    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(Array.isArray(res.body.keys)).toBe(true);

    const kids = (res.body.keys as Array<{ kid: string }>).map((k) => k.kid).sort();
    expect(kids).toEqual([__TEST_JWT_KEYS__.currentKid, __TEST_JWT_KEYS__.previousKid].sort());

    for (const key of res.body.keys as Array<Record<string, string>>) {
      expect(key.kty).toBe('RSA');
      expect(key.alg).toBe('RS256');
      expect(key.use).toBe('sig');
      expect(typeof key.n).toBe('string');
      expect(typeof key.e).toBe('string');
    }
  });
});
