import { ApiProperty } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CLIENT_STATUSES } from '../../entities/client.entity';
import type { ClientStatus } from '../../entities/client.entity';

export class CreateClientDto {
  @ApiProperty({ example: 'Shopping A', minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  name: string;

  @ApiProperty({ enum: CLIENT_STATUSES, required: false, default: 'onboarding' })
  @IsOptional()
  @IsIn(CLIENT_STATUSES, { message: `status must be one of: ${CLIENT_STATUSES.join(', ')}` })
  status?: ClientStatus;
}
