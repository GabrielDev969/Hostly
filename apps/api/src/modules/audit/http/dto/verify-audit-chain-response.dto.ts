import { ApiProperty } from '@nestjs/swagger';

export class VerifyAuditChainResponseDto {
  @ApiProperty({ description: 'Whether the audit log chain is intact' })
  valid: boolean;

  @ApiProperty({ description: 'Total audit log rows in the database' })
  total: number;

  @ApiProperty({
    description: 'Number of rows whose hash was successfully recomputed. Equals total when valid.',
  })
  scanned: number;

  @ApiProperty({
    description: 'ID of the first row that failed verification, if any',
    nullable: true,
  })
  brokenAt: string | null;

  @ApiProperty({
    description: 'Why verification failed',
    enum: ['ok', 'bad_hash', 'broken_chain'],
  })
  reason: 'ok' | 'bad_hash' | 'broken_chain';
}
