import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty({
    example: 'custom:module:billing:read',
    description:
      'Permission key. Must start with "custom:" and use lowercase segments separated by ":", ".", "-", or "_".',
  })
  @IsString()
  @Matches(/^custom:[a-z0-9]+(?:[._:-][a-z0-9]+)+$/, {
    message: 'key must match ^custom:<segment>(:<segment>)+$ with lowercase a-z0-9 segments',
  })
  @MaxLength(120)
  key: string;

  @ApiProperty({ required: false, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiProperty({
    required: false,
    example: 'billing',
    description: 'Category label. Defaults to "custom".',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;
}
