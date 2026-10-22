import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'user@company.com' })
  email: string;

  @ApiProperty({ example: 'John Doe' })
  name: string;

  @ApiProperty({
    example: false,
    description: 'Whether 2FA is currently enabled for this user',
  })
  twoFactorEnabled: boolean;

  @ApiProperty({ example: '2026-05-09T12:34:56.789Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-05-09T12:34:56.789Z' })
  updatedAt: Date;
}
