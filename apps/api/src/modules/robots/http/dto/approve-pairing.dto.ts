import { ApiProperty } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { LookupPairingDto } from './lookup-pairing.dto';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ApprovePairingDto extends LookupPairingDto {
  @ApiProperty({ format: 'uuid', description: 'Site the robot goes to; its client comes along' })
  @IsUUID('4')
  siteId: string;

  @ApiProperty({
    required: false,
    minLength: 2,
    maxLength: 120,
    description: 'Defaults to the serial for a new robot; omitted keeps the current name',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Transform(trim)
  name?: string;
}
