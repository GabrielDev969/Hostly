export interface EmailVerifyToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface CreateEmailVerifyTokenData {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export abstract class EmailVerifyTokensRepository {
  abstract create(data: CreateEmailVerifyTokenData): Promise<EmailVerifyToken>;
  abstract findByTokenHash(tokenHash: string): Promise<EmailVerifyToken | null>;
  abstract markUsed(id: string): Promise<void>;
  abstract deletePendingForUser(userId: string): Promise<void>;
  abstract deleteExpired(cutoff: Date): Promise<number>;
}
