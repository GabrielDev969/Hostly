import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  AuditLogChainPage,
  AuditLogsRepository,
  CreateAuditLogData,
  FindAuditLogsParams,
  FindAuditLogsResult,
} from './audit-logs.repository.interface';
import { AuditLog } from '../entities/audit-log.entity';
import { AuditLog as PrismaAuditLog, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ScopedPrismaService } from '@shared/tenancy/scoped-prisma.service';

// Arbitrary stable bigint passed to pg_advisory_xact_lock so concurrent
// audit-log inserts serialize on the chain and can't fork prevHash.
const CHAIN_LOCK_KEY = 0xa1d11_1067n;

export function computeAuditHash(
  prevHash: string | null,
  fields: {
    id: string;
    userId: string | null;
    workspaceId: string | null;
    organizationId: string | null;
    clientId: string | null;
    action: string;
    resource: string | null;
    resourceId: string | null;
    metadata: unknown;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
  },
): string {
  const canonical = JSON.stringify({
    prevHash,
    id: fields.id,
    userId: fields.userId,
    workspaceId: fields.workspaceId,
    organizationId: fields.organizationId,
    clientId: fields.clientId,
    action: fields.action,
    resource: fields.resource,
    resourceId: fields.resourceId,
    metadata: fields.metadata ?? null,
    ipAddress: fields.ipAddress,
    userAgent: fields.userAgent,
    createdAt: fields.createdAt.toISOString(),
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

@Injectable()
export class PrismaAuditLogsRepository extends AuditLogsRepository {
  // Writes and chain maintenance span every tenant, so they use the raw client; listing is scoped.
  constructor(
    private prisma: PrismaService,
    private scoped: ScopedPrismaService,
  ) {
    super();
  }

  async create(data: CreateAuditLogData): Promise<AuditLog> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHAIN_LOCK_KEY})`;

      const last = await tx.auditLog.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { hash: true },
      });
      const prevHash = last?.hash ?? null;

      const id = crypto.randomUUID();
      const createdAt = new Date();
      const metadata = data.metadata ?? null;

      const hash = computeAuditHash(prevHash, {
        id,
        userId: data.userId ?? null,
        workspaceId: data.workspaceId ?? null,
        organizationId: data.organizationId ?? null,
        clientId: data.clientId ?? null,
        action: data.action,
        resource: data.resource ?? null,
        resourceId: data.resourceId ?? null,
        metadata,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        createdAt,
      });

      const log = await tx.auditLog.create({
        data: {
          id,
          userId: data.userId,
          workspaceId: data.workspaceId,
          organizationId: data.organizationId,
          clientId: data.clientId,
          action: data.action,
          resource: data.resource,
          resourceId: data.resourceId,
          metadata: metadata ?? Prisma.JsonNull,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          createdAt,
          prevHash,
          hash,
        },
      });
      return this.toEntity(log);
    });
  }

  async findMany(params: FindAuditLogsParams): Promise<FindAuditLogsResult> {
    const where: Prisma.AuditLogWhereInput = {
      workspaceId: params.workspaceId,
    };

    if (params.userId) where.userId = params.userId;
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) (where.createdAt as Prisma.DateTimeFilter).gte = params.from;
      if (params.to) (where.createdAt as Prisma.DateTimeFilter).lte = params.to;
    }
    if (params.action) {
      if (params.action.endsWith('*')) {
        where.action = { startsWith: params.action.slice(0, -1) };
      } else {
        where.action = params.action;
      }
    }

    const [items, total] = await Promise.all([
      this.scoped.client.auditLog.findMany({
        where,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.scoped.client.auditLog.count({ where }),
    ]);

    return {
      items: items.map((l) => this.toEntity(l)),
      total,
    };
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const result = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return result.count;
  }

  async countAll(): Promise<number> {
    return this.prisma.auditLog.count();
  }

  async iterateChainAsc(afterId: string | null, pageSize: number): Promise<AuditLogChainPage> {
    const items = await this.prisma.auditLog.findMany({
      ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: pageSize,
    });
    const last = items[items.length - 1];
    return {
      items: items.map((l) => this.toEntity(l)),
      nextCursor: items.length === pageSize && last ? last.id : null,
    };
  }

  private toEntity(raw: PrismaAuditLog): AuditLog {
    return {
      id: raw.id,
      userId: raw.userId,
      workspaceId: raw.workspaceId,
      organizationId: raw.organizationId,
      clientId: raw.clientId,
      action: raw.action,
      resource: raw.resource,
      resourceId: raw.resourceId,
      metadata: raw.metadata as Record<string, unknown> | null,
      ipAddress: raw.ipAddress,
      userAgent: raw.userAgent,
      prevHash: raw.prevHash,
      hash: raw.hash,
      createdAt: raw.createdAt,
    };
  }
}
