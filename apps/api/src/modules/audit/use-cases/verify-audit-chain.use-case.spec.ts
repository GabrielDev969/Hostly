import { VerifyAuditChainUseCase } from './verify-audit-chain.use-case';
import { AuditLogsRepository } from '../repositories/audit-logs.repository.interface';
import { computeAuditHash } from '../repositories/prisma-audit-logs.repository';
import type { AuditLog } from '../entities/audit-log.entity';

function makeLog(prevHash: string | null, overrides: Partial<AuditLog> = {}): AuditLog {
  const base: AuditLog = {
    id: overrides.id ?? `log-${Math.random()}`,
    userId: null,
    workspaceId: null,
    organizationId: null,
    clientId: null,
    action: 'test.event',
    resource: null,
    resourceId: null,
    metadata: null,
    ipAddress: null,
    userAgent: null,
    prevHash,
    hash: '',
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
  base.hash = computeAuditHash(prevHash, base);
  return base;
}

function setup(items: AuditLog[]) {
  const auditLogs = {
    countAll: jest.fn().mockResolvedValue(items.length),
    iterateChainAsc: jest.fn().mockImplementation((cursor: string | null) => {
      // Return everything at once; the use case still terminates because
      // nextCursor is null.
      if (cursor !== null) return Promise.resolve({ items: [], nextCursor: null });
      return Promise.resolve({ items, nextCursor: null });
    }),
  } as unknown as jest.Mocked<AuditLogsRepository>;
  return { useCase: new VerifyAuditChainUseCase(auditLogs), auditLogs };
}

describe('VerifyAuditChainUseCase', () => {
  it('returns valid=true and scans every row for an intact chain', async () => {
    const g = makeLog(null, { id: 'g' });
    const b = makeLog(g.hash, { id: 'b' });
    const c = makeLog(b.hash, { id: 'c' });
    const { useCase } = setup([g, b, c]);

    const result = await useCase.execute();
    expect(result).toEqual({
      valid: true,
      total: 3,
      scanned: 3,
      brokenAt: null,
      reason: 'ok',
    });
  });

  it('accepts orphan prevHash on the first scanned row (post-cleanup anchor)', async () => {
    // After retention cleanup the first remaining row keeps its old prevHash
    // pointing to a row that no longer exists. The use case treats it as the
    // new genesis and validates from there.
    const orphan = makeLog('deleted-prev', { id: 'orphan' });
    const next = makeLog(orphan.hash, { id: 'next' });
    const { useCase } = setup([orphan, next]);

    const result = await useCase.execute();
    expect(result.valid).toBe(true);
    expect(result.scanned).toBe(2);
  });

  it('returns broken_chain when a row’s prevHash does not match the previous hash', async () => {
    const g = makeLog(null, { id: 'g' });
    const tampered = makeLog('wrong-prev', { id: 'tampered' });
    const { useCase } = setup([g, tampered]);

    const result = await useCase.execute();
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('broken_chain');
    expect(result.brokenAt).toBe('tampered');
  });

  it('returns bad_hash when a row’s stored hash does not match its content', async () => {
    const g = makeLog(null, { id: 'g' });
    const b = makeLog(g.hash, { id: 'b' });
    // Tamper with content but keep stored hash unchanged
    b.action = 'evil.event';
    const { useCase } = setup([g, b]);

    const result = await useCase.execute();
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('bad_hash');
    expect(result.brokenAt).toBe('b');
  });

  it('returns valid=true for an empty chain', async () => {
    const { useCase } = setup([]);
    const result = await useCase.execute();
    expect(result).toEqual({
      valid: true,
      total: 0,
      scanned: 0,
      brokenAt: null,
      reason: 'ok',
    });
  });
});
