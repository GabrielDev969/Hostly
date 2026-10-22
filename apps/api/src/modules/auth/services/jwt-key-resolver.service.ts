import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { env } from 'src/config/env.config';

export interface JwksKey {
  kid: string;
  kty: 'RSA';
  alg: 'RS256';
  use: 'sig';
  n: string;
  e: string;
}

export interface JwksPayload {
  keys: JwksKey[];
}

@Injectable()
export class JwtKeyResolverService {
  readonly currentKid: string;
  readonly currentPrivateKey: string;
  readonly jwks: JwksPayload;
  private readonly publicKeys: ReadonlyMap<string, string>;

  constructor() {
    this.currentKid = env.JWT_ACCESS_CURRENT_KID;
    this.currentPrivateKey = env.JWT_ACCESS_PRIVATE_KEY_CURRENT;
    this.publicKeys = new Map(Object.entries(env.JWT_ACCESS_PUBLIC_KEYS));
    this.jwks = {
      keys: Array.from(this.publicKeys.entries()).map(([kid, pem]) => {
        const jwk = crypto.createPublicKey(pem).export({ format: 'jwk' }) as {
          kty: string;
          n: string;
          e: string;
        };
        return {
          kid,
          kty: 'RSA',
          alg: 'RS256',
          use: 'sig',
          n: jwk.n,
          e: jwk.e,
        };
      }),
    };
  }

  publicKeyFor(kid: string | undefined): string {
    if (!kid) {
      throw new UnauthorizedException('Missing kid in token header');
    }
    const pem = this.publicKeys.get(kid);
    if (!pem) {
      throw new UnauthorizedException('Unknown signing key');
    }
    return pem;
  }

  kidFromToken(token: string): string | undefined {
    const headerSegment = token.split('.')[0];
    if (!headerSegment) return undefined;
    try {
      const header = JSON.parse(Buffer.from(headerSegment, 'base64url').toString('utf8')) as {
        kid?: unknown;
      };
      return typeof header.kid === 'string' ? header.kid : undefined;
    } catch {
      return undefined;
    }
  }
}
