import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { JwtKeyResolverService } from './jwt-key-resolver.service';

describe('JwtKeyResolverService', () => {
  const resolver = new JwtKeyResolverService();

  it('exposes the current kid and a matching private key', () => {
    expect(resolver.currentKid).toBeTruthy();
    expect(resolver.currentPrivateKey).toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
  });

  it('builds a JWKS payload with RFC 7517 fields for every configured kid', () => {
    expect(resolver.jwks.keys.length).toBeGreaterThanOrEqual(1);
    for (const key of resolver.jwks.keys) {
      expect(key.kty).toBe('RSA');
      expect(key.alg).toBe('RS256');
      expect(key.use).toBe('sig');
      expect(typeof key.kid).toBe('string');
      expect(key.n).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(key.e).toMatch(/^[A-Za-z0-9_-]+$/);
    }
    expect(resolver.jwks.keys.some((k) => k.kid === resolver.currentKid)).toBe(true);
  });

  it('returns the PEM for a known kid', () => {
    const pem = resolver.publicKeyFor(resolver.currentKid);
    expect(pem).toMatch(/-----BEGIN [A-Z ]*PUBLIC KEY-----/);
  });

  it('throws Unauthorized when kid is missing', () => {
    expect(() => resolver.publicKeyFor(undefined)).toThrow(UnauthorizedException);
  });

  it('throws Unauthorized when kid is unknown', () => {
    expect(() => resolver.publicKeyFor('not-a-real-kid')).toThrow(UnauthorizedException);
  });

  it('parses the kid out of a JWT header', async () => {
    const jwt = new JwtService({});
    const token = await jwt.signAsync(
      { sub: 'u1' },
      {
        privateKey: resolver.currentPrivateKey,
        keyid: resolver.currentKid,
        expiresIn: '5m',
        algorithm: 'RS256',
      },
    );
    expect(resolver.kidFromToken(token)).toBe(resolver.currentKid);
  });

  it('returns undefined when the token has no header kid', async () => {
    const jwt = new JwtService({});
    const token = await jwt.signAsync(
      { sub: 'u1' },
      {
        privateKey: resolver.currentPrivateKey,
        expiresIn: '5m',
        algorithm: 'RS256',
      },
    );
    expect(resolver.kidFromToken(token)).toBeUndefined();
  });

  it('returns undefined when the token header is malformed', () => {
    expect(resolver.kidFromToken('not-a-jwt')).toBeUndefined();
    expect(resolver.kidFromToken('')).toBeUndefined();
  });
});
