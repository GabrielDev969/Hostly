import { generateKeyPairSync, randomBytes } from 'crypto';

// Prints fresh development secrets to paste into the root .env, so no private key is ever committed.
const kid = `dev-${new Date().toISOString().slice(0, 10)}`;
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const toBase64 = (pem: string) => Buffer.from(pem).toString('base64');

console.log(`JWT_ACCESS_CURRENT_KID=${kid}`);
console.log(`JWT_ACCESS_PRIVATE_KEY_CURRENT=${toBase64(privateKey)}`);
console.log(`JWT_ACCESS_PUBLIC_KEYS=${JSON.stringify({ [kid]: toBase64(publicKey) })}`);
console.log(`ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`);
