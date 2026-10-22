export interface PasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface CreatePasswordResetTokenData {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export abstract class PasswordResetTokensRepository {
  abstract create(data: CreatePasswordResetTokenData): Promise<PasswordResetToken>;
  abstract findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null>;
  abstract markUsed(id: string): Promise<void>;
  abstract deletePendingForUser(userId: string): Promise<void>;
  abstract deleteExpired(cutoff: Date): Promise<number>;
}
