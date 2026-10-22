import { ApiProperty } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsEmail, IsString, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'user@company.com',
    description: 'Registered email',
  })
  @IsEmail({}, { message: 'Invalid email' })
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim().toLowerCase() : (value as unknown),
  )
  email: string;

  @ApiProperty({
    example: 'StrongPass@123',
    description: 'User password',
  })
  @IsString()
  @IsNotEmpty({ message: 'Password cannot be empty' })
  password: string;
}
