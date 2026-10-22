import { Injectable } from '@nestjs/common';
import { UsersRepository } from './users.repository.interface';
import type {
  CreateUserData,
  FindManyByWorkspaceParams,
  FindManyResult,
  UpdateUserData,
} from './users.repository.interface';
import { User } from '../entities/user.entity';
import { PrismaService } from '@shared/database/prisma.service';
import { User as PrismaUser } from '@prisma/client';
import { Cacheable } from '@shared/cache/cacheable.decorator';
import { InvalidateCache } from '@shared/cache/invalidate-cache.decorator';
import { CACHE_NS, CACHE_TTL } from '@shared/cache/cache.constants';
import { CacheService } from '@shared/cache/cache.service';

@Injectable()
export class PrismaUsersRepository extends UsersRepository {
  constructor(
    private prisma: PrismaService,
    protected readonly cacheService: CacheService,
  ) {
    super();
  }

  async create(data: CreateUserData): Promise<User> {
    const user = await this.prisma.user.create({ data });
    return this.toEntity(user);
  }

  @Cacheable({
    namespace: CACHE_NS.users,
    key: (id: string) => `id:${id}`,
    ttlMs: CACHE_TTL.fifteenMinutes,
  })
  async findById(id: string): Promise<User | null> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
    return user ? this.toEntity(user) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
    return user ? this.toEntity(user) : null;
  }

  async findByEmailIncludingDeleted(email: string): Promise<User | null> {
    const user = await this.prisma.user.findFirst({
      where: { email, anonymizedAt: null },
    });
    return user ? this.toEntity(user) : null;
  }

  async findPendingAnonymization(cutoff: Date): Promise<User[]> {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: { lt: cutoff, not: null },
        anonymizedAt: null,
      },
    });
    return users.map((u) => this.toEntity(u));
  }

  @InvalidateCache(CACHE_NS.users)
  async update(id: string, data: UpdateUserData): Promise<User> {
    const user = await this.prisma.user.update({ where: { id }, data });
    return this.toEntity(user);
  }

  @InvalidateCache(CACHE_NS.users, CACHE_NS.workspaceMembers)
  async softDelete(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  @InvalidateCache(CACHE_NS.users, CACHE_NS.workspaceMembers)
  async restore(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  @InvalidateCache(CACHE_NS.users, CACHE_NS.workspaceMembers, CACHE_NS.sessions)
  async anonymize(id: string): Promise<void> {
    const placeholder = `deleted-${id}@anonymized.local`;
    await this.prisma.$transaction([
      this.prisma.session.deleteMany({ where: { userId: id } }),
      this.prisma.emailVerifyToken.deleteMany({ where: { userId: id } }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId: id } }),
      this.prisma.user.update({
        where: { id },
        data: {
          email: placeholder,
          name: 'Deleted User',
          passwordHash: null,
          twoFactorEnabled: false,
          twoFactorSecret: null,
          recoveryCodes: null,
          emailVerifiedAt: null,
          anonymizedAt: new Date(),
        },
      }),
    ]);
  }

  @Cacheable({
    namespace: CACHE_NS.users,
    key: (id: string, workspaceId: string) => `id:${id}:ws:${workspaceId}`,
    ttlMs: CACHE_TTL.fifteenMinutes,
  })
  async findByIdInWorkspace(id: string, workspaceId: string): Promise<User | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
        memberships: { some: { workspaceId } },
      },
    });
    return user ? this.toEntity(user) : null;
  }

  async findManyByWorkspace(params: FindManyByWorkspaceParams): Promise<FindManyResult> {
    const where = {
      deletedAt: null,
      memberships: { some: { workspaceId: params.workspaceId } },
      ...(params.search && {
        OR: [
          { name: { contains: params.search, mode: 'insensitive' as const } },
          { email: { contains: params.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((u) => this.toEntity(u)),
      total,
    };
  }

  @InvalidateCache(CACHE_NS.users)
  async incrementFailedLoginAttempts(id: string): Promise<number> {
    const user = await this.prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });
    return user.failedLoginAttempts;
  }

  @InvalidateCache(CACHE_NS.users)
  async lockAccount(id: string, until: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lockedUntil: until },
    });
  }

  @InvalidateCache(CACHE_NS.users)
  async resetFailedLoginAttempts(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  @Cacheable({
    namespace: CACHE_NS.users,
    key: (id: string) => `invalidatedAt:${id}`,
    ttlMs: CACHE_TTL.fifteenSeconds,
  })
  async findTokensInvalidatedAt(id: string): Promise<Date | null> {
    const row = await this.prisma.user.findUnique({
      where: { id },
      select: { tokensInvalidatedAt: true },
    });
    return row?.tokensInvalidatedAt ?? null;
  }

  @InvalidateCache(CACHE_NS.users)
  async invalidateTokens(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { tokensInvalidatedAt: new Date() },
    });
  }

  private toEntity(raw: PrismaUser): User {
    return {
      id: raw.id,
      email: raw.email,
      name: raw.name,
      passwordHash: raw.passwordHash,
      twoFactorEnabled: raw.twoFactorEnabled,
      twoFactorSecret: raw.twoFactorSecret,
      recoveryCodes: raw.recoveryCodes,
      emailVerifiedAt: raw.emailVerifiedAt,
      failedLoginAttempts: raw.failedLoginAttempts,
      lockedUntil: raw.lockedUntil,
      tokensInvalidatedAt: raw.tokensInvalidatedAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      deletedAt: raw.deletedAt,
      anonymizedAt: raw.anonymizedAt,
    };
  }
}
