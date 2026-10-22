import { Job } from 'bullmq';
import { MaintenanceProcessor } from './maintenance.processor';
import {
  ANONYMIZE_EXPIRED_USERS_JOB,
  CLEANUP_EXPIRED_SESSIONS_JOB,
  CLEANUP_EXPIRED_TOKENS_JOB,
  CLEANUP_OLD_AUDIT_LOGS_JOB,
} from './maintenance.jobs';
import { AnonymizeExpiredUsersUseCase } from '@modules/users/use-cases/anonymize-expired-users.use-case';
import { CleanupExpiredSessionsUseCase } from '@modules/sessions/use-cases/cleanup-expired-sessions.use-case';
import { CleanupExpiredTokensUseCase } from '@modules/auth/use-cases/cleanup-expired-tokens.use-case';
import { CleanupOldAuditLogsUseCase } from '@modules/audit/use-cases/cleanup-old-audit-logs.use-case';

function setup() {
  const anonymize = {
    execute: jest.fn().mockResolvedValue({ anonymized: 0 }),
  } as unknown as jest.Mocked<AnonymizeExpiredUsersUseCase>;
  const cleanupSessions = {
    execute: jest.fn().mockResolvedValue({ deleted: 0 }),
  } as unknown as jest.Mocked<CleanupExpiredSessionsUseCase>;
  const cleanupTokens = {
    execute: jest.fn().mockResolvedValue({ emailVerify: 0, passwordReset: 0 }),
  } as unknown as jest.Mocked<CleanupExpiredTokensUseCase>;
  const cleanupAudit = {
    execute: jest.fn().mockResolvedValue({ deleted: 0 }),
  } as unknown as jest.Mocked<CleanupOldAuditLogsUseCase>;
  const processor = new MaintenanceProcessor(
    anonymize,
    cleanupSessions,
    cleanupTokens,
    cleanupAudit,
  );
  return { processor, anonymize, cleanupSessions, cleanupTokens, cleanupAudit };
}

describe('MaintenanceProcessor', () => {
  it('routes anonymize-expired-users to AnonymizeExpiredUsersUseCase', async () => {
    const { processor, anonymize } = setup();
    await processor.process({ name: ANONYMIZE_EXPIRED_USERS_JOB } as Job);
    expect(anonymize.execute).toHaveBeenCalled();
  });

  it('routes cleanup-expired-sessions to CleanupExpiredSessionsUseCase', async () => {
    const { processor, cleanupSessions } = setup();
    await processor.process({ name: CLEANUP_EXPIRED_SESSIONS_JOB } as Job);
    expect(cleanupSessions.execute).toHaveBeenCalled();
  });

  it('routes cleanup-expired-tokens to CleanupExpiredTokensUseCase', async () => {
    const { processor, cleanupTokens } = setup();
    await processor.process({ name: CLEANUP_EXPIRED_TOKENS_JOB } as Job);
    expect(cleanupTokens.execute).toHaveBeenCalled();
  });

  it('routes cleanup-old-audit-logs to CleanupOldAuditLogsUseCase', async () => {
    const { processor, cleanupAudit } = setup();
    await processor.process({ name: CLEANUP_OLD_AUDIT_LOGS_JOB } as Job);
    expect(cleanupAudit.execute).toHaveBeenCalled();
  });

  it('ignores unknown jobs without throwing', async () => {
    const { processor, anonymize, cleanupSessions } = setup();
    await expect(processor.process({ name: 'other' } as Job)).resolves.toBeUndefined();
    expect(anonymize.execute).not.toHaveBeenCalled();
    expect(cleanupSessions.execute).not.toHaveBeenCalled();
  });
});
