import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { SessionsRepository } from '../repositories/sessions.repository.interface';

@Injectable()
export class RevokeSessionUseCase {
  constructor(private sessions: SessionsRepository) {}

  async execute(sessionId: string, userId: string) {
    const session = await this.sessions.findById(sessionId);
    if (!session) throw new NotFoundException('Session not found');

    // Make sure the user can only revoke their own sessions
    if (session.userId !== userId) {
      throw new ForbiddenException('Cannot revoke this session');
    }

    if (session.revokedAt) return; // already revoked, idempotent
    await this.sessions.revoke(sessionId);
  }
}
