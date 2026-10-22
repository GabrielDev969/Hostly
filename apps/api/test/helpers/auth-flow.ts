import request from 'supertest';
import { App } from 'supertest/types';
import { TestEmailDispatcher } from './test-email-dispatcher';

export interface RegisterCredentials {
  email: string;
  name: string;
  password: string;
}

export async function registerAndVerify(
  server: App,
  dispatcher: TestEmailDispatcher,
  credentials: RegisterCredentials,
): Promise<void> {
  await request(server).post('/api/v1/auth/register').send(credentials).expect(201);

  const msg = dispatcher.lastFor(credentials.email);
  if (!msg) {
    throw new Error(
      `No verification email captured for ${credentials.email}. ` + `Did register fail to enqueue?`,
    );
  }

  const urlMatch = msg.text.match(/https?:\/\/\S+/);
  if (!urlMatch) {
    throw new Error('No URL found in verification email body');
  }

  const token = new URL(urlMatch[0]).searchParams.get('token');
  if (!token) {
    throw new Error('No token query param in verification URL');
  }

  await request(server).post('/api/v1/auth/verify-email').send({ token }).expect(204);
}
