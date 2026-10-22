import { ApiProperty } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsIn, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { CLIENT_STATUSES } from '../../entities/client.entity';
import type { ClientStatus } from '../../entities/client.entity';

// ValidateIf instead of IsOptional: null would reach a non-nullable column; only absence keeps the value.
export class UpdateClientDto {
  @ApiProperty({ required: false, minLength: 2, maxLength: 120 })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  name?: string;

  @ApiProperty({ enum: CLIENT_STATUSES, required: false })
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(CLIENT_STATUSES, { message: `status must be one of: ${CLIENT_STATUSES.join(', ')}` })
  status?: ClientStatus;
}
