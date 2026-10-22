import { VerifyAuditChainUseCase } from './verify-audit-chain.use-case';
import { AuditLogsRepository } from '../repositories/audit-logs.repository.interface';
import { createHash } from 'crypto';
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
    hashVersion: 2,
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
  base.hash = computeAuditHash(prevHash, base, base.hashVersion);
  return base;
}

// The boilerplate's original formula, written out independently of computeAuditHash.
function legacyHash(prevHash: string | null, log: AuditLog): string {
  const canonical = JSON.stringify({
    prevHash,
    id: log.id,
    userId: log.userId,
    workspaceId: log.workspaceId,
    action: log.action,
    resource: log.resource,
    resourceId: log.resourceId,
    metadata: log.metadata ?? null,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    createdAt: log.createdAt.toISOString(),
  });
  return createHash('sha256').update(canonical).digest('hex');
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

  it('still verifies rows hashed with the old formula after organizationId is backfilled', async () => {
    const legacy: AuditLog = {
      ...makeLog(null, { id: 'legacy', workspaceId: 'w1' }),
      hashVersion: 1,
    };
    legacy.hash = legacyHash(null, legacy);
    // What the tenant_scope migration does to existing rows.
    legacy.organizationId = 'org1';
    const next = makeLog(legacy.hash, {
      id: 'new',
      workspaceId: 'w1',
      organizationId: 'org1',
      clientId: 'client-a',
      createdAt: new Date('2026-01-02T00:00:00Z'),
    });

    const result = await setup([legacy, next]).useCase.execute();

    expect(result).toMatchObject({ valid: true, scanned: 2, reason: 'ok' });
  });

  it('detects tampering with the scope columns of version 2 rows', async () => {
    const row = makeLog(null, { organizationId: 'org1', clientId: 'client-a' });
    row.clientId = 'client-b';

    const result = await setup([row]).useCase.execute();

    expect(result).toMatchObject({ valid: false, reason: 'bad_hash' });
  });

  it('verifies version 2 rows whose metadata comes back with another key order (JSONB)', async () => {
    const written = makeLog(null, {
      metadata: { method: 'POST', path: '/users', params: {}, body: { name: 'A', email: 'a@b.c' } },
    });
    const readBack: AuditLog = {
      ...written,
      metadata: { body: { email: 'a@b.c', name: 'A' }, path: '/users', params: {}, method: 'POST' },
    };

    const result = await setup([readBack]).useCase.execute();

    expect(result).toMatchObject({ valid: true, reason: 'ok' });
  });

  it('hashes version 2 metadata independently of key order, nested and inside arrays', () => {
    const base = makeLog(null);
    const a = { ...base, metadata: { b: 1, a: { d: [{ y: 1, x: 2 }], c: 3 } } };
    const b = { ...base, metadata: { a: { c: 3, d: [{ x: 2, y: 1 }] }, b: 1 } };

    expect(computeAuditHash(null, a, 2)).toBe(computeAuditHash(null, b, 2));
    // Inherited v1 defect: the old formula depends on key order, so such v1 rows stay unverifiable.
    expect(computeAuditHash(null, a, 1)).not.toBe(computeAuditHash(null, b, 1));
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
