import { ApiProperty } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';

export class ResendEmailVerificationDto {
  @ApiProperty({
    example: 'user@company.com',
    description: 'Email of the account to confirm (will be normalized to lowercase)',
    maxLength: 255,
  })
  @IsEmail({}, { message: 'Invalid email' })
  @MaxLength(255, { message: 'Email is too long' })
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim().toLowerCase() : (value as unknown),
  )
  email: string;
}
