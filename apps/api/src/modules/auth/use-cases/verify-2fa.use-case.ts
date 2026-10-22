import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { TokenService } from '../services/token.service';
import { TwoFactorService } from '../services/two-factor.service';
import { LoginUseCase } from './login.use-case';
import { MetricsService } from '@shared/metrics/metrics.service';
import { AuditService } from '@modules/audit/services/audit.service';

interface VerifyInput {
  challenge: string;
  code: string;
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class VerifyTwoFactorUseCase {
  constructor(
    private users: UsersRepository,
    private tokens: TokenService,
    private twoFactor: TwoFactorService,
    private loginUseCase: LoginUseCase,
    private metrics: MetricsService,
    private audit: AuditService,
  ) {}

  async execute(input: VerifyInput) {
    let userId: string;
    try {
      userId = await this.tokens.verifyChallengeToken(input.challenge);
    } catch {
      this.metrics.incTwoFactorVerify('invalid_challenge');
      await this.audit.log({
        userId: null,
        action: 'auth.2fa.verify.failure',
        metadata: { reason: 'invalid_challenge' },
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      });
      throw new UnauthorizedException('Invalid or expired challenge');
    }

    const user = await this.users.findById(userId);
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret)
      throw new BadRequestException('2FA is not enabled for this user');

    const secret = this.twoFactor.decryptSecret(user.twoFactorSecret);
    const totpOk = this.twoFactor.verifyToken(secret, input.code);

    if (!totpOk) {
      const remaining = this.twoFactor.consumeRecoveryCode(user.recoveryCodes, input.code);
      if (!remaining) {
        this.metrics.incTwoFactorVerify('invalid_code');
        await this.audit.log({
          userId,
          action: 'auth.2fa.verify.failure',
          metadata: { reason: 'invalid_code' },
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
        });
        throw new UnauthorizedException('Invalid code');
      }
      await this.users.update(userId, { recoveryCodes: remaining });
    }

    this.metrics.incTwoFactorVerify('success');
    return this.loginUseCase.issueTokens(userId, input.userAgent, input.ipAddress);
  }
}
