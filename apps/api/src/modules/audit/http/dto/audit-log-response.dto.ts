import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuditLogResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Actor; null for system-initiated actions',
  })
  userId: string | null;

  @ApiProperty({ example: 'user.created' })
  action: string;

  @ApiPropertyOptional({ example: 'User' })
  resource: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  resourceId: string | null;

  @ApiPropertyOptional({
    description: 'Action-specific payload; shape varies by action',
    example: { reason: 'invited via dashboard' },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON column
  metadata: Record<string, any> | null;

  @ApiPropertyOptional({ example: '203.0.113.42' })
  ipAddress: string | null;

  @ApiPropertyOptional({ example: 'Mozilla/5.0 ...' })
  userAgent: string | null;

  @ApiProperty({ example: '2026-05-09T12:34:56.789Z' })
  createdAt: Date;
}
