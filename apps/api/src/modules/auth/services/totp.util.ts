import * as crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1;

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateCode(secret: string, counter: bigint): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(counter);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac.readUInt8(hmac.length - 1) & 0x0f;
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS)
    .toString()
    .padStart(DIGITS, '0');
  return code;
}

export function generateSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function buildOtpAuthUrl(issuer: string, label: string, secret: string): string {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?${params.toString()}`;
}

export function generateToken(secret: string, time = Date.now()): string {
  const counter = BigInt(Math.floor(time / 1000 / STEP_SECONDS));
  return generateCode(secret, counter);
}

export function verifyToken(secret: string, token: string, time = Date.now()): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const tokenBuf = Buffer.from(token, 'utf8');
  const counter = BigInt(Math.floor(time / 1000 / STEP_SECONDS));
  let matched = 0;
  for (let i = -WINDOW; i <= WINDOW; i++) {
    const candidate = Buffer.from(generateCode(secret, counter + BigInt(i)), 'utf8');
    if (crypto.timingSafeEqual(candidate, tokenBuf)) matched = 1;
  }
  return matched === 1;
}
