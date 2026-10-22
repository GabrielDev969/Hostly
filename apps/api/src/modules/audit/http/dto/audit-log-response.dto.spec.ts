import { AuditLogResponseDto } from './audit-log-response.dto';

describe('AuditLogResponseDto', () => {
  it('is a plain class with assignable fields', () => {
    const dto = new AuditLogResponseDto();
    dto.id = 'a1';
    dto.action = 'user.created';
    dto.resource = 'User';
    dto.resourceId = 'u1';
    dto.userId = 'admin';
    dto.metadata = { reason: 'invited' };
    dto.ipAddress = '203.0.113.42';
    dto.userAgent = 'Mozilla/5.0';
    dto.createdAt = new Date('2026-01-01');
    expect(dto.id).toBe('a1');
    expect(dto.metadata).toEqual({ reason: 'invited' });
  });
});
