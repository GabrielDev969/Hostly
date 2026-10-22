import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'Bad Request' })
  error: string;

  @ApiProperty({ example: 'Invalid input' })
  message: string;

  @ApiProperty({ example: '2026-05-09T12:34:56.789Z' })
  timestamp: string;

  @ApiProperty({ example: '/api/v1/users' })
  path: string;

  @ApiProperty({
    required: false,
    example: 'req-12',
    description: 'Correlation id propagated from pino-http when present',
  })
  requestId?: string;

  @ApiProperty({
    required: false,
    description: 'Stack trace; only included when NODE_ENV !== production',
  })
  stack?: string;
}

export class ValidationErrorResponseDto extends ErrorResponseDto {
  @ApiProperty({
    example: 'Validation failed',
    description: 'Always "Validation failed" for class-validator errors',
  })
  declare message: string;

  @ApiProperty({
    type: [String],
    example: ['email must be a valid email', 'password is too weak'],
    description: 'Per-field validation error messages',
  })
  details: string[];
}
