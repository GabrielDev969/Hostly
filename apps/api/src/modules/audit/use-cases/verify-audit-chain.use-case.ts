import { Injectable } from '@nestjs/common';
import { AuditLogsRepository } from '../repositories/audit-logs.repository.interface';
import {
  AUDIT_HASH_VERSIONS,
  LEGACY_AUDIT_HASH_VERSION,
  computeAuditHash,
} from '../repositories/prisma-audit-logs.repository';

export interface VerifyAuditChainResult {
  valid: boolean;
  total: number;
  scanned: number;
  brokenAt: string | null;
  reason: 'ok' | 'bad_hash' | 'broken_chain' | 'bad_version';
}

const PAGE_SIZE = 500;

@Injectable()
export class VerifyAuditChainUseCase {
  constructor(private readonly auditLogs: AuditLogsRepository) {}

  async execute(): Promise<VerifyAuditChainResult> {
    const total = await this.auditLogs.countAll();

    let cursor: string | null = null;
    let expectedPrevHash: string | null = null;
    let scanned = 0;
    let first = true;
    let pastLegacy = false;

    for (;;) {
      const page = await this.auditLogs.iterateChainAsc(cursor, PAGE_SIZE);
      if (page.items.length === 0) break;

      for (const log of page.items) {
        if (first) {
          // The first row we scan defines our chain anchor. Its prevHash may
          // point to a row that was hard-deleted by retention cleanup — we
          // accept it as the new genesis and only validate from here on.
          expectedPrevHash = log.prevHash;
          first = false;
        }

        if (log.prevHash !== expectedPrevHash) {
          return {
            valid: false,
            total,
            scanned,
            brokenAt: log.id,
            reason: 'broken_chain',
          };
        }

        const legacy = log.hashVersion === LEGACY_AUDIT_HASH_VERSION;
        if (!AUDIT_HASH_VERSIONS.has(log.hashVersion) || (legacy && pastLegacy)) {
          return {
            valid: false,
            total,
            scanned,
            brokenAt: log.id,
            reason: 'bad_version',
          };
        }

        // Version 1 hashed metadata in insertion order, which JSONB does not keep, so a legacy
        // row can only be checked by its link; legacy rows may only precede the current formula.
        if (!legacy) {
          const recomputed = computeAuditHash(
            log.prevHash,
            {
              id: log.id,
              userId: log.userId,
              workspaceId: log.workspaceId,
              organizationId: log.organizationId,
              clientId: log.clientId,
              action: log.action,
              resource: log.resource,
              resourceId: log.resourceId,
              metadata: log.metadata,
              ipAddress: log.ipAddress,
              userAgent: log.userAgent,
              createdAt: log.createdAt,
            },
            log.hashVersion,
          );

          if (recomputed !== log.hash) {
            return {
              valid: false,
              total,
              scanned,
              brokenAt: log.id,
              reason: 'bad_hash',
            };
          }
          pastLegacy = true;
        }

        expectedPrevHash = log.hash;
        scanned++;
      }

      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    return { valid: true, total, scanned, brokenAt: null, reason: 'ok' };
  }
}
