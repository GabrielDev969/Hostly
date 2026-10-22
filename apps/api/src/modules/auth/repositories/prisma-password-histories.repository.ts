import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { PasswordHistoriesRepository } from './password-histories.repository.interface';

@Injectable()
export class PrismaPasswordHistoriesRepository extends PasswordHistoriesRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async findRecentHashes(userId: string, limit: number): Promise<string[]> {
    if (limit <= 0) return [];
    const rows = await this.prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { passwordHash: true },
    });
    return rows.map((r) => r.passwordHash);
  }

  async record(userId: string, passwordHash: string, retain: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordHistory.create({
        data: { userId, passwordHash },
      });
      if (retain <= 0) {
        await tx.passwordHistory.deleteMany({ where: { userId } });
        return;
      }
      const kept = await tx.passwordHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: retain,
        select: { id: true },
      });
      const keepIds = kept.map((r) => r.id);
      await tx.passwordHistory.deleteMany({
        where: { userId, id: { notIn: keepIds } },
      });
    });
  }
}
