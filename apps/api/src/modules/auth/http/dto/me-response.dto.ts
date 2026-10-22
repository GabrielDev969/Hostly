import { ApiProperty } from '@nestjs/swagger';

export class MeWorkspaceDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Acme Inc.' })
  name: string;

  @ApiProperty({ example: 'acme-inc' })
  slug: string;

  @ApiProperty({ example: false })
  isPersonal: boolean;
}

export class MeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'user@company.com' })
  email: string;

  @ApiProperty({ example: 'John Doe' })
  name: string;

  @ApiProperty({ example: false })
  twoFactorEnabled: boolean;

  @ApiProperty({
    example: false,
    description: 'True if member of the __admin__ workspace',
  })
  isSuperAdmin: boolean;

  @ApiProperty({ type: [MeWorkspaceDto] })
  workspaces: MeWorkspaceDto[];
}
