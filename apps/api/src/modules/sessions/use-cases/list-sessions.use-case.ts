import { Injectable } from '@nestjs/common';
import { SessionsRepository } from '../repositories/sessions.repository.interface';

@Injectable()
export class ListSessionsUseCase {
  constructor(private sessions: SessionsRepository) {}

  async execute(userId: string, currentSessionId?: string) {
    const sessions = await this.sessions.findActiveByUser(userId);
    return sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      lastUsedAt: s.lastUsedAt,
      createdAt: s.createdAt,
      isCurrent: s.id === currentSessionId,
    }));
  }
}
