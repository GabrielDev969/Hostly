import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  EmailVerifyToken,
  EmailVerifyTokensRepository,
  CreateEmailVerifyTokenData,
} from './email-verify-tokens.repository.interface';

@Injectable()
export class PrismaEmailVerifyTokensRepository extends EmailVerifyTokensRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async create(data: CreateEmailVerifyTokenData): Promise<EmailVerifyToken> {
    return this.prisma.emailVerifyToken.create({ data });
  }

  async findByTokenHash(tokenHash: string): Promise<EmailVerifyToken | null> {
    return this.prisma.emailVerifyToken.findUnique({ where: { tokenHash } });
  }

  async markUsed(id: string): Promise<void> {
    await this.prisma.emailVerifyToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  async deletePendingForUser(userId: string): Promise<void> {
    await this.prisma.emailVerifyToken.deleteMany({
      where: { userId, usedAt: null },
    });
  }

  async deleteExpired(cutoff: Date): Promise<number> {
    const result = await this.prisma.emailVerifyToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    return result.count;
  }
}
