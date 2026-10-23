import { generateKeyPairSync } from 'crypto';

function genRsaPairBase64() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return {
    privateKey: Buffer.from(privateKey).toString('base64'),
    publicKey: Buffer.from(publicKey).toString('base64'),
  };
}

const current = genRsaPairBase64();
const previous = genRsaPairBase64();

process.env.NODE_ENV = 'test';
process.env.API_PORT = '3001';
process.env.APP_URL = 'http://localhost:3000';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.JWT_ACCESS_CURRENT_KID = 'e2e-current';
process.env.JWT_ACCESS_PRIVATE_KEY_CURRENT = current.privateKey;
process.env.JWT_ACCESS_PUBLIC_KEYS = JSON.stringify({
  'e2e-current': current.publicKey,
  'e2e-previous': previous.publicKey,
});
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
if (!process.env.REDIS_HOST) process.env.REDIS_HOST = 'localhost';
if (!process.env.REDIS_PORT) process.env.REDIS_PORT = '6379';
process.env.THROTTLE_TTL = '60';
process.env.THROTTLE_LIMIT = '100';
// Short enough for the presence e2e, long enough that a busy CI does not miss a pong.
process.env.ROBOT_SOCKET_PING_INTERVAL_MS = '1000';
process.env.ROBOT_SOCKET_MISSED_PINGS = '3';
process.env.ROBOT_SOCKET_HELLO_TIMEOUT_MS = '2000';
process.env.LIVE_TICKET_TTL_MS = '2000';
process.env.LIVE_SOCKET_MAX_AGE_MS = '8000';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    'postgresql://postgres:postgres@localhost:5432/workspace_test?schema=public';
}

export const __TEST_JWT_KEYS__ = {
  currentKid: 'e2e-current',
  previousKid: 'e2e-previous',
  currentPrivateKeyBase64: current.privateKey,
  currentPublicKeyBase64: current.publicKey,
  previousPrivateKeyBase64: previous.privateKey,
  previousPublicKeyBase64: previous.publicKey,
};
