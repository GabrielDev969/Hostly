import { ApiProperty } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { IsStrongPassword } from '@shared/decorators/is-strong-password.decorator';
import { PASSWORD_POLICY } from '@shared/utils/password-policy.util';

export class RegisterDto {
  @ApiProperty({
    example: 'user@company.com',
    description: 'User email (will be normalized to lowercase)',
    maxLength: 255,
  })
  @IsEmail({}, { message: 'Invalid email' })
  @MaxLength(255, { message: 'Email is too long' })
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim().toLowerCase() : (value as unknown),
  )
  email: string;

  @ApiProperty({
    example: 'John Doe',
    description: 'Full name of the user',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(100, { message: 'Name must be at most 100 characters' })
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  name: string;

  @ApiProperty({
    example: 'Tr0ub4dor&3-quay',
    description:
      'Strong password: min 12 chars with upper/lower/digit/special, no whitespace, no common passwords, no character runs or sequences, must not contain your email or name.',
    minLength: PASSWORD_POLICY.minLength,
    maxLength: PASSWORD_POLICY.maxLength,
  })
  @IsString()
  @IsStrongPassword()
  password: string;
}
