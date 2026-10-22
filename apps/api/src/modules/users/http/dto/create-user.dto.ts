import { ApiProperty } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsEmail, IsString, IsUUID, MinLength, MaxLength } from 'class-validator';
import { IsStrongPassword } from '@shared/decorators/is-strong-password.decorator';
import { PASSWORD_POLICY } from '@shared/utils/password-policy.util';

export class CreateUserDto {
  @ApiProperty({ example: 'user@company.com', maxLength: 255 })
  @IsEmail({}, { message: 'Invalid email' })
  @MaxLength(255)
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim().toLowerCase() : (value as unknown),
  )
  email: string;

  @ApiProperty({ example: 'John Doe', minLength: 2, maxLength: 100 })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  name: string;

  @ApiProperty({
    example: 'Tr0ub4dor&3-quay',
    minLength: PASSWORD_POLICY.minLength,
    maxLength: PASSWORD_POLICY.maxLength,
    description: 'Strong password (see register endpoint for full rules)',
  })
  @IsString()
  @IsStrongPassword()
  password: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Role to assign within the workspace',
  })
  @IsUUID('4')
  roleId: string;
}
