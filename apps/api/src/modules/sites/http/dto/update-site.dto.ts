import { ApiProperty } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsOptional, ValidateIf, IsString, MaxLength, MinLength } from 'class-validator';
import { canonicalTimeZone, IsRegionTimeZone } from './canonical-time-zone';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

// ValidateIf instead of IsOptional: null would reach a non-nullable column; only absence keeps the value.
export class UpdateSiteDto {
  @ApiProperty({ required: false, minLength: 2, maxLength: 120 })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Transform(trim)
  name?: string;

  @ApiProperty({ required: false, example: 'America/Sao_Paulo' })
  @ValidateIf((_, value) => value !== undefined)
  @IsRegionTimeZone()
  @Transform(canonicalTimeZone)
  timezone?: string;

  @ApiProperty({
    required: false,
    nullable: true,
    type: String,
    maxLength: 500,
    description: 'null clears it',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trim)
  address?: string | null;
}
