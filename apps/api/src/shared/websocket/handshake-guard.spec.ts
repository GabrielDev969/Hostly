import type { IncomingMessage } from 'http';
import {
  BLOCKED_IP_ATTEMPT_INTERVAL_MS,
  clientIp,
  HandshakeLimiter,
  MAX_TRACKED_IPS,
  SECRET_FORMAT,
} from './handshake-guard';

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

  describe('with the IP blocked', () => {
    beforeEach(() => jest.useFakeTimers({ now: 0 }));
    afterEach(() => jest.useRealTimers());

    const blocked = () => {
      const limiter = new HandshakeLimiter(3, 60_000);
      for (let i = 0; i < 3; i += 1) limiter.recordRefusal('ip');
      return limiter;
    };

    it('lets one attempt through every 5 s and refuses the others', () => {
      const limiter = blocked();
      expect(limiter.admit('ip')).toBe(false);
      jest.advanceTimersByTime(BLOCKED_IP_ATTEMPT_INTERVAL_MS - 1);
      expect(limiter.admit('ip')).toBe(false);
      jest.advanceTimersByTime(1);
      expect([limiter.admit('ip'), limiter.admit('ip')]).toEqual([true, false]);
      jest.advanceTimersByTime(BLOCKED_IP_ATTEMPT_INTERVAL_MS);
      expect([limiter.admit('ip'), limiter.admit('ip')]).toEqual([true, false]);
      expect(limiter.isBlocked('ip')).toBe(true);
    });

    it('lets at most 12 attempts through in a minute, however many come', () => {
      const limiter = blocked();
      let admitted = 0;
      for (let t = 0; t < 60_000; t += 100) {
        jest.setSystemTime(t);
        if (limiter.admit('ip')) admitted += 1;
      }
      expect(admitted).toBeLessThanOrEqual(12);
      expect(admitted).toBeGreaterThanOrEqual(11);
    });

    it('lets everything through once the window ends, and never holds back a free IP', () => {
      const limiter = blocked();
      expect(limiter.admit('other')).toBe(true);
      expect(limiter.admit('other')).toBe(true);
      expect(limiter.trackedIps).toBe(1);
      jest.advanceTimersByTime(60_000);
      expect([limiter.admit('ip'), limiter.admit('ip')]).toEqual([true, true]);
    });
  });

  it('keeps at most MAX_TRACKED_IPS windows, dropping the oldest', () => {
    const limiter = new HandshakeLimiter(2, 60_000);
    limiter.recordRefusal('first', 0);
    limiter.recordRefusal('first', 0);
    for (let i = 0; i < MAX_TRACKED_IPS; i += 1) limiter.recordRefusal(`ip-${i}`, 1);

    expect(limiter.trackedIps).toBe(MAX_TRACKED_IPS);
    expect(limiter.isBlocked('first', 2)).toBe(false);
  });
});
