import { Injectable } from '@nestjs/common';
import { SessionsRepository, CreateSessionData } from './sessions.repository.interface';
import { Session } from '../entities/session.entity';
import { PrismaService } from '@shared/database/prisma.service';
import { Session as SessionPrisma } from '@prisma/client';
import { Cacheable } from '@shared/cache/cacheable.decorator';
import { InvalidateCache } from '@shared/cache/invalidate-cache.decorator';
import { CACHE_NS, CACHE_TTL } from '@shared/cache/cache.constants';
import { CacheService } from '@shared/cache/cache.service';

@Injectable()
export class PrismaSessionsRepository extends SessionsRepository {
  constructor(
    private prisma: PrismaService,
    protected readonly cacheService: CacheService,
  ) {
    super();
  }

  async create(data: CreateSessionData): Promise<Session> {
    const session = await this.prisma.session.create({ data });
    return this.toEntity(session);
  }

  @Cacheable({
    namespace: CACHE_NS.sessions,
    key: (id: string) => `id:${id}`,
    ttlMs: CACHE_TTL.fifteenSeconds,
  })
  async findById(id: string): Promise<Session | null> {
    const session = await this.prisma.session.findUnique({ where: { id } });
    return session ? this.toEntity(session) : null;
  }

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: tokenHash },
    });
    return session ? this.toEntity(session) : null;
  }

  async findActiveByUser(userId: string): Promise<Session[]> {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastUsedAt: 'desc' },
    });
    return sessions.map((s) => this.toEntity(s));
  }

  @InvalidateCache(CACHE_NS.sessions)
  async revoke(id: string): Promise<void> {
    await this.prisma.session.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  @InvalidateCache(CACHE_NS.sessions)
  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId && { id: { not: exceptSessionId } }),
      },
      data: { revokedAt: new Date() },
    });
  }

  async deleteExpired(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    return result.count;
  }

  private toEntity(raw: SessionPrisma): Session {
    return {
      id: raw.id,
      userId: raw.userId,
      refreshTokenHash: raw.refreshTokenHash,
      userAgent: raw.userAgent,
      ipAddress: raw.ipAddress,
      expiresAt: raw.expiresAt,
      revokedAt: raw.revokedAt,
      lastUsedAt: raw.lastUsedAt,
      createdAt: raw.createdAt,
    };
  }
}
