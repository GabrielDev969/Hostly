import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { CryptoUtil } from '@shared/utils/crypto.util';
import { env } from 'src/config/env.config';
import * as totp from './totp.util';

const ISSUER = 'Workspace API';
const RECOVERY_CODE_COUNT = 10;

@Injectable()
export class TwoFactorService {
  generateSecret(): string {
    return totp.generateSecret();
  }

  buildOtpAuthUrl(email: string, secret: string): string {
    return totp.buildOtpAuthUrl(ISSUER, email, secret);
  }

  verifyToken(secret: string, token: string): boolean {
    return totp.verifyToken(secret, token);
  }

  generateToken(secret: string): string {
    return totp.generateToken(secret);
  }

  encryptSecret(secret: string): string {
    return CryptoUtil.encrypt(secret, env.ENCRYPTION_KEY);
  }

  decryptSecret(encrypted: string): string {
    return CryptoUtil.decrypt(encrypted, env.ENCRYPTION_KEY);
  }

  generateRecoveryCodes(): string[] {
    return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
      const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
      return `${raw.slice(0, 5)}-${raw.slice(5)}`;
    });
  }

  hashRecoveryCodes(codes: string[]): string {
    return JSON.stringify(codes.map((c) => CryptoUtil.hashToken(c)));
  }

  consumeRecoveryCode(stored: string | null, plain: string): string | null {
    if (!stored) return null;
    const hashes = JSON.parse(stored) as string[];
    const idx = hashes.indexOf(CryptoUtil.hashToken(plain));
    if (idx < 0) return null;
    hashes.splice(idx, 1);
    return JSON.stringify(hashes);
  }
}
