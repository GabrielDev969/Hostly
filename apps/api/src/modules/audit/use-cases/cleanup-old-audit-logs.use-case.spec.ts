import { CleanupOldAuditLogsUseCase } from './cleanup-old-audit-logs.use-case';
import { AuditLogsRepository } from '../repositories/audit-logs.repository.interface';
import { env } from 'src/config/env.config';

describe('CleanupOldAuditLogsUseCase', () => {
  it('computes the cutoff from AUDIT_RETENTION_DAYS and forwards to repo', async () => {
    const auditLogs = {
      deleteOlderThan: jest.fn().mockResolvedValue(42),
    } as unknown as jest.Mocked<AuditLogsRepository>;
    const useCase = new CleanupOldAuditLogsUseCase(auditLogs);
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const result = await useCase.execute();

    const expected = new Date(now - env.AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    expect(auditLogs.deleteOlderThan).toHaveBeenCalledWith(expected);
    expect(result).toEqual({ deleted: 42 });
  });
});
