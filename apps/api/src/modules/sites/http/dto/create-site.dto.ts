import { ApiProperty } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsOptional, IsString, IsTimeZone, IsUUID, MaxLength, MinLength } from 'class-validator';
import { canonicalTimeZone } from './canonical-time-zone';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateSiteDto {
  @ApiProperty({ format: 'uuid', description: 'Client the site belongs to; cannot change later' })
  @IsUUID('4')
  clientId: string;

  @ApiProperty({ example: 'Piso L2', minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Transform(trim)
  name: string;

  @ApiProperty({ example: 'America/Sao_Paulo', description: 'IANA time zone of the schedule' })
  @IsTimeZone()
  @Transform(canonicalTimeZone)
  timezone: string;

  @ApiProperty({ example: 'Av. Paulista, 1000', required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trim)
  address?: string;
}
