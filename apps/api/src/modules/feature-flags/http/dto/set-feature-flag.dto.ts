import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetFeatureFlagDto {
  @ApiProperty({
    description: 'Override the default for this workspace: true to force on, false to force off',
  })
  @IsBoolean()
  enabled: boolean;
}
