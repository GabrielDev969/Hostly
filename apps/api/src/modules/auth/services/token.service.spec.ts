import { JwtService } from '@nestjs/jwt';
import { JWT_AUDIENCE, JWT_ISSUER, TokenService } from './token.service';
import { JwtKeyResolverService } from './jwt-key-resolver.service';

function decodeHeader(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString('utf8'));
}

describe('TokenService', () => {
  const jwt = new JwtService({});
  const resolver = new JwtKeyResolverService();
  const service = new TokenService(jwt, resolver);

  it('signs an access token (RS256) with sub, sessionId, and kid header; verifies with the resolved public key', async () => {
    const token = await service.signAccessToken({
      userId: 'u1',
      sessionId: 's1',
    });

    const header = decodeHeader(token);
    expect(header.alg).toBe('RS256');
    expect(header.kid).toBe(resolver.currentKid);

    const publicKey = resolver.publicKeyFor(resolver.kidFromToken(token));
    const payload = await jwt.verifyAsync<{ sub: string; sessionId: string }>(token, {
      publicKey,
      algorithms: ['RS256'],
    });

    expect(payload.sub).toBe('u1');
    expect(payload.sessionId).toBe('s1');
  });

  it('stamps the access token with its issue time in milliseconds', async () => {
    const now = Date.parse('2026-10-23T12:00:00.734Z');
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    try {
      const token = await service.signAccessToken({ userId: 'u1', sessionId: 's1' });
      const payload = jwt.decode<{ iat: number; iatMs: number }>(token);
      expect(payload.iatMs).toBe(now);
      expect(payload.iat).toBe(Math.floor(now / 1000));
    } finally {
      clock.mockRestore();
    }
  });

  it('round-trips a 2FA challenge token (kid in header) and rejects tokens with the wrong type marker', async () => {
    const token = await service.signChallengeToken('u1');
    expect(decodeHeader(token).kid).toBe(resolver.currentKid);

    await expect(service.verifyChallengeToken(token)).resolves.toBe('u1');

    const wrongType = await jwt.signAsync(
      { sub: 'u1', type: 'access' },
      {
        privateKey: resolver.currentPrivateKey,
        keyid: resolver.currentKid,
        expiresIn: '5m',
        algorithm: 'RS256',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      },
    );

    await expect(service.verifyChallengeToken(wrongType)).rejects.toThrow(
      'Invalid challenge token',
    );
  });

  it('rejects a challenge token signed with an unknown kid', async () => {
    const unknownKid = await jwt.signAsync(
      { sub: 'u1', type: '2fa-challenge' },
      {
        privateKey: resolver.currentPrivateKey,
        keyid: 'not-a-real-kid',
        expiresIn: '5m',
        algorithm: 'RS256',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      },
    );

    await expect(service.verifyChallengeToken(unknownKid)).rejects.toThrow('Unknown signing key');
  });
});
