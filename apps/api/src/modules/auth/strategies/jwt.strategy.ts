import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { SessionsRepository } from '@modules/sessions/repositories/sessions.repository.interface';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { JWT_AUDIENCE, JWT_ISSUER, type AccessTokenPayload } from '../services/token.service';
import { JwtKeyResolverService } from '../services/jwt-key-resolver.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private sessions: SessionsRepository,
    private users: UsersRepository,
    resolver: JwtKeyResolverService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      secretOrKeyProvider: (
        _request: unknown,
        rawJwtToken: string,
        done: (err: Error | null, secret?: string) => void,
      ) => {
        try {
          const pem = resolver.publicKeyFor(resolver.kidFromToken(rawJwtToken));
          done(null, pem);
        } catch (err) {
          done(err as Error);
        }
      },
    });
  }

  async validate(payload: {
    sub: string;
    sessionId?: string;
    type?: string;
    iatMs?: number;
  }): Promise<AccessTokenPayload> {
    // Challenge tokens share the signing key; only session-bound access tokens may authenticate.
    if (payload.type !== undefined || !payload.sessionId || typeof payload.iatMs !== 'number') {
      throw new UnauthorizedException('Invalid access token');
    }

    const session = await this.sessions.findById(payload.sessionId);
    if (!session || session.revokedAt || new Date(session.expiresAt).getTime() < Date.now()) {
      throw new UnauthorizedException('Session is no longer active');
    }

    const invalidatedAt = await this.users.findTokensInvalidatedAt(payload.sub);
    // A token from the same millisecond as the invalidation cannot be ordered, so it fails closed.
    if (invalidatedAt && payload.iatMs <= invalidatedAt.getTime()) {
      throw new UnauthorizedException('Token has been invalidated');
    }

    return { id: payload.sub, sessionId: payload.sessionId };
  }
}
