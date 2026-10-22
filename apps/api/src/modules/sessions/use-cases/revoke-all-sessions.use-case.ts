import { Injectable } from '@nestjs/common';
import { SessionsRepository } from '../repositories/sessions.repository.interface';

@Injectable()
export class RevokeAllSessionsUseCase {
  constructor(private sessions: SessionsRepository) {}

  async execute(userId: string, exceptSessionId?: string) {
    await this.sessions.revokeAllForUser(userId, exceptSessionId);
  }
}
