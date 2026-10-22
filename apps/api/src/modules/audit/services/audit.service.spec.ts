import { Logger } from '@nestjs/common';
import { AuditService } from './audit.service';
import {
  AuditLogsRepository,
  CreateAuditLogData,
} from '../repositories/audit-logs.repository.interface';
import { AuditLog } from '../entities/audit-log.entity';
import { TenantContext } from '@shared/tenancy/tenant-context';

describe('AuditService', () => {
  let logs: jest.Mocked<AuditLogsRepository>;
  let service: AuditService;

  beforeEach(() => {
    logs = {
      create: jest.fn(),
      findMany: jest.fn(),
      deleteOlderThan: jest.fn(),
      countAll: jest.fn(),
      iterateChainAsc: jest.fn(),
    };
    service = new AuditService(logs);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('forwards the payload to the repository on success', async () => {
    logs.create.mockResolvedValue({ id: 'a1' } as AuditLog);

    const payload: CreateAuditLogData = {
      userId: 'u1',
      workspaceId: 'w1',
      action: 'user.update',
      resource: 'user',
      resourceId: 'u2',
      metadata: { changed: ['name'] },
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    };

    await service.log(payload);

    expect(logs.create).toHaveBeenCalledWith({ ...payload, organizationId: null, clientId: null });
  });

  it('fills workspace, organization and client from the tenant scope', async () => {
    logs.create.mockResolvedValue({ id: 'a1' } as AuditLog);
    const scope = {
      organizationId: 'org1',
      workspaceId: 'w1',
      clientId: 'client-a',
      advertiserId: null,
    };

    await TenantContext.runWithScope(scope, () =>
      service.record({ actorId: 'u1', action: 'site.created', entity: 'Site', entityId: 's1' }),
    );

    expect(logs.create).toHaveBeenCalledWith({
      userId: 'u1',
      action: 'site.created',
      resource: 'Site',
      resourceId: 's1',
      metadata: null,
      workspaceId: 'w1',
      organizationId: 'org1',
      clientId: 'client-a',
    });
  });

  it('swallows repository errors and logs them via Nest Logger', async () => {
    const error = new Error('db is down');
    logs.create.mockRejectedValue(error);
    const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(service.log({ action: 'user.update' })).resolves.toBeUndefined();

    expect(loggerSpy).toHaveBeenCalledWith(
      'Failed to write audit log',
      expect.objectContaining({
        err: 'db is down',
        action: 'user.update',
      }),
    );
  });
});
