import { AuditLog } from '../entities/audit-log.entity';

export interface CreateAuditLogData {
  userId?: string | null;
  workspaceId?: string | null;
  action: string;
  resource?: string | null;
  resourceId?: string | null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON column
  metadata?: Record<string, any> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface FindAuditLogsParams {
  workspaceId: string;
  userId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

export interface FindAuditLogsResult {
  items: AuditLog[];
  total: number;
}

export interface AuditLogChainPage {
  items: AuditLog[];
  nextCursor: string | null;
}

export abstract class AuditLogsRepository {
  abstract create(data: CreateAuditLogData): Promise<AuditLog>;
  abstract findMany(params: FindAuditLogsParams): Promise<FindAuditLogsResult>;
  abstract deleteOlderThan(cutoff: Date): Promise<number>;
  abstract countAll(): Promise<number>;
  abstract iterateChainAsc(afterId: string | null, pageSize: number): Promise<AuditLogChainPage>;
}
