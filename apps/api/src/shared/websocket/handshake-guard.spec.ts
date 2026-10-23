import type { IncomingMessage } from 'http';
import { clientIp, HandshakeLimiter, SECRET_FORMAT } from './handshake-guard';

const request = (remoteAddress: string, forwardedFor?: string) =>
  ({
    socket: { remoteAddress },
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
  }) as unknown as IncomingMessage;

describe('SECRET_FORMAT', () => {
  it('accepts only 64 lowercase hex characters', () => {
    expect(SECRET_FORMAT.test('a'.repeat(64))).toBe(true);
    expect(SECRET_FORMAT.test('a'.repeat(63))).toBe(false);
    expect(SECRET_FORMAT.test('A'.repeat(64))).toBe(false);
    expect(SECRET_FORMAT.test(`${'a'.repeat(64)}\n`)).toBe(false);
  });
});

describe('clientIp', () => {
  it('follows TRUST_PROXY like Express req.ip', () => {
    const req = request('10.0.0.1', '203.0.113.7, 198.51.100.2');
    expect(clientIp(req, false)).toBe('10.0.0.1');
    expect(clientIp(req, 1)).toBe('198.51.100.2');
    expect(clientIp(req, 2)).toBe('203.0.113.7');
    expect(clientIp(req, 5)).toBe('203.0.113.7');
    expect(clientIp(req, true)).toBe('203.0.113.7');
    expect(clientIp(request('10.0.0.1'), 1)).toBe('10.0.0.1');
  });
});

describe('HandshakeLimiter', () => {
  it('blocks an IP after the refusals of a window and frees it when the window ends', () => {
    const limiter = new HandshakeLimiter(3, 1_000);
    expect([0, 1, 2].map(() => limiter.recordRefusal('ip', 0))).toEqual([false, false, true]);
    expect(limiter.isBlocked('ip', 500)).toBe(true);
    expect(limiter.isBlocked('other', 500)).toBe(false);
    expect(limiter.isBlocked('ip', 1_000)).toBe(false);
  });
});
