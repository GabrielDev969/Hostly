import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { TokenService } from '../services/token.service';
import { CryptoUtil } from '@shared/utils/crypto.util';
import { CreateSessionUseCase } from '@modules/sessions/use-cases/create-session.use-case';
import { MetricsService } from '@shared/metrics/metrics.service';
import { AuditService } from '@modules/audit/services/audit.service';

interface LoginInput {
  email: string;
  password: string;
  userAgent?: string;
  ipAddress?: string;
}

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

@Injectable()
export class LoginUseCase {
  constructor(
    private users: UsersRepository,
    private tokens: TokenService,
    private createSession: CreateSessionUseCase,
    private metrics: MetricsService,
    private audit: AuditService,
  ) {}

  async execute(input: LoginInput) {
    const user = await this.users.findByEmailIncludingDeleted(input.email);
    if (!user || !user.passwordHash) {
      this.metrics.incLoginAttempt('failure');
      await this.audit.log({
        userId: null,
        action: 'auth.login.failure',
        metadata: { reason: 'unknown_email', email: input.email },
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      this.metrics.incLoginAttempt('failure');
      await this.audit.log({
        userId: user.id,
        action: 'auth.login.failure',
        metadata: {
          reason: 'account_locked',
          lockedUntil: user.lockedUntil.toISOString(),
        },
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      });
      throw new HttpException(
        {
          statusCode: HttpStatus.LOCKED,
          error: 'Locked',
          message:
            'Account temporarily locked due to too many failed login attempts. Try again later.',
        },
        HttpStatus.LOCKED,
      );
    }

    const valid = await CryptoUtil.verifyPassword(user.passwordHash, input.password);
    if (!valid) {
      this.metrics.incLoginAttempt('failure');
      const attempts = await this.users.incrementFailedLoginAttempts(user.id);
      const justLocked = attempts >= MAX_FAILED_LOGIN_ATTEMPTS;
      if (justLocked) {
        await this.users.lockAccount(user.id, new Date(Date.now() + LOCKOUT_DURATION_MS));
      }
      await this.audit.log({
        userId: user.id,
        action: justLocked ? 'auth.account.locked' : 'auth.login.failure',
        metadata: {
          reason: 'invalid_password',
          email: input.email,
          attempts,
        },
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.deletedAt) {
      await this.users.restore(user.id);
    }

    if (!user.emailVerifiedAt) {
      this.metrics.incLoginAttempt('failure');
      await this.audit.log({
        userId: user.id,
        action: 'auth.login.failure',
        metadata: { reason: 'email_not_verified' },
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      });
      throw new ForbiddenException(
        'Email not verified. Check your inbox for the verification link.',
      );
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.users.resetFailedLoginAttempts(user.id);
    }

    if (user.twoFactorEnabled) {
      this.metrics.incLoginAttempt('requires_2fa');
      const challenge = await this.tokens.signChallengeToken(user.id);
      return { requires2FA: true as const, challenge };
    }

    this.metrics.incLoginAttempt('success');
    return this.issueTokens(user.id, input.userAgent, input.ipAddress);
  }

  async issueTokens(userId: string, userAgent?: string, ipAddress?: string) {
    const refreshToken = CryptoUtil.generateToken(64);

    const session = await this.createSession.execute({
      userId,
      refreshToken,
      userAgent,
      ipAddress,
    });

    const accessToken = await this.tokens.signAccessToken({
      userId,
      sessionId: session.id,
    });

    return { accessToken, refreshToken };
  }
}
