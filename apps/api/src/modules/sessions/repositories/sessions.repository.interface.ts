import { Session } from '../entities/session.entity';

export interface CreateSessionData {
  userId: string;
  refreshTokenHash: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  expiresAt: Date;
}

export abstract class SessionsRepository {
  abstract create(data: CreateSessionData): Promise<Session>;
  abstract findById(id: string): Promise<Session | null>;
  abstract findByTokenHash(tokenHash: string): Promise<Session | null>;
  abstract findActiveByUser(userId: string): Promise<Session[]>;
  abstract revoke(id: string): Promise<void>;
  abstract revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void>;
  abstract deleteExpired(retentionDays: number): Promise<number>;
}
