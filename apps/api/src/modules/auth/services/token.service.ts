import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { nanoid } from 'nanoid';
import { env } from 'src/config/env.config';
import { JwtKeyResolverService } from './jwt-key-resolver.service';

export interface AccessTokenPayload {
  id: string;
  sessionId: string;
}

export const JWT_ISSUER = env.JWT_ISSUER ?? env.APP_URL;
export const JWT_AUDIENCE = env.JWT_AUDIENCE ?? env.APP_URL;

@Injectable()
export class TokenService {
  constructor(
    private jwt: JwtService,
    private resolver: JwtKeyResolverService,
  ) {}

  signAccessToken(input: { userId: string; sessionId: string }): Promise<string> {
    return this.jwt.signAsync(
      { sub: input.userId, sessionId: input.sessionId },
      {
        privateKey: this.resolver.currentPrivateKey,
        keyid: this.resolver.currentKid,
        expiresIn: env.JWT_ACCESS_EXPIRES_IN,
        algorithm: 'RS256',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        jwtid: nanoid(),
      },
    );
  }

  signChallengeToken(userId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, type: '2fa-challenge' },
      {
        privateKey: this.resolver.currentPrivateKey,
        keyid: this.resolver.currentKid,
        expiresIn: '5m',
        algorithm: 'RS256',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        jwtid: nanoid(),
      },
    );
  }

  async verifyChallengeToken(token: string): Promise<string> {
    const publicKey = this.resolver.publicKeyFor(this.resolver.kidFromToken(token));
    const payload = await this.jwt.verifyAsync<{ sub: string; type: string }>(token, {
      publicKey,
      algorithms: ['RS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (payload.type !== '2fa-challenge') {
      throw new Error('Invalid challenge token');
    }
    return payload.sub;
  }
}
