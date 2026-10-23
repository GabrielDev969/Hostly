import { describe, expect, it } from 'vitest';
import { tokenPageHeaders, tokenRequestLogPatterns } from './security-headers';

describe('tokenPageHeaders', () => {
  it('sends no Referer from each page opened with a token in the URL', () => {
    expect(tokenPageHeaders()).toEqual(
      ['/invitations/accept', '/auth/verify-email', '/auth/reset-password'].map((source) => ({
        source,
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      })),
    );
  });
});

describe('tokenRequestLogPatterns', () => {
  const ignored = (url: string) => tokenRequestLogPatterns.some((pattern) => pattern.test(url));

  it('keeps out of the dev log the requests that carry a token', () => {
    expect(ignored('/invitations/accept?token=abc')).toBe(true);
    expect(ignored('/auth/verify-email?lang=pt&token=abc')).toBe(true);
    expect(ignored('/auth/reset-password?token=abc')).toBe(true);
  });

  it('logs the rest', () => {
    expect(ignored('/auth/verify-email')).toBe(false);
    expect(ignored('/login?next=%2Frobots')).toBe(false);
    expect(ignored('/robots?mytoken=abc')).toBe(false);
  });
});
