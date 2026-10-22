import { Injectable } from '@nestjs/common';
import { SessionsRepository } from '../repositories/sessions.repository.interface';
import { CryptoUtil } from '@shared/utils/crypto.util';

interface CreateSessionInput {
  userId: string;
  refreshToken: string;
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class CreateSessionUseCase {
  constructor(private sessions: SessionsRepository) {}

  async execute(input: CreateSessionInput) {
    const refreshTokenHash = CryptoUtil.hashToken(input.refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    return this.sessions.create({
      userId: input.userId,
      refreshTokenHash,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
      expiresAt,
    });
  }
}
