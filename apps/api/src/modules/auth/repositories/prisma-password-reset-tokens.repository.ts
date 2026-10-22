import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  PasswordResetToken,
  PasswordResetTokensRepository,
  CreatePasswordResetTokenData,
} from './password-reset-tokens.repository.interface';

@Injectable()
export class PrismaPasswordResetTokensRepository extends PasswordResetTokensRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async create(data: CreatePasswordResetTokenData): Promise<PasswordResetToken> {
    return this.prisma.passwordResetToken.create({ data });
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    return this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  }

  async markUsed(id: string): Promise<void> {
    await this.prisma.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  async deletePendingForUser(userId: string): Promise<void> {
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId, usedAt: null },
    });
  }

  async deleteExpired(cutoff: Date): Promise<number> {
    const result = await this.prisma.passwordResetToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    return result.count;
  }
}
