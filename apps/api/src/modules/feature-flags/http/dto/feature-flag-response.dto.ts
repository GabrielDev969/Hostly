import { ApiProperty } from '@nestjs/swagger';

export class FeatureFlagResponseDto {
  @ApiProperty()
  key: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ description: 'Effective state after applying overrides' })
  enabled: boolean;

  @ApiProperty({ description: 'Default for the flag in the registry' })
  defaultEnabled: boolean;

  @ApiProperty({
    description: 'True when the workspace has an explicit row overriding the default',
  })
  overridden: boolean;
}
