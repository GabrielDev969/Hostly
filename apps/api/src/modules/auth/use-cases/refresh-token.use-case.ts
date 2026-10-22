import { Injectable, UnauthorizedException } from '@nestjs/common';
import { TokenService } from '../services/token.service';

import { CryptoUtil } from '@shared/utils/crypto.util';
import { CreateSessionUseCase } from '@modules/sessions/use-cases/create-session.use-case';
import { SessionsRepository } from '@modules/sessions/repositories/sessions.repository.interface';

@Injectable()
export class RefreshTokenUseCase {
  constructor(
    private tokens: TokenService,
    private sessions: SessionsRepository,
    private createSession: CreateSessionUseCase,
  ) {}

  async execute(refreshToken: string) {
    const tokenHash = CryptoUtil.hashToken(refreshToken);
    const session = await this.sessions.findByTokenHash(tokenHash);

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      if (session?.userId) {
        await this.sessions.revokeAllForUser(session.userId);
      }
      throw new UnauthorizedException('Invalid session');
    }

    await this.sessions.revoke(session.id);

    const newRefresh = CryptoUtil.generateToken(64);

    const newSession = await this.createSession.execute({
      userId: session.userId,
      refreshToken: newRefresh,
      userAgent: session.userAgent ?? undefined,
      ipAddress: session.ipAddress ?? undefined,
    });

    const newAccess = await this.tokens.signAccessToken({
      userId: session.userId,
      sessionId: newSession.id,
    });

    return { accessToken: newAccess, refreshToken: newRefresh };
  }
}
