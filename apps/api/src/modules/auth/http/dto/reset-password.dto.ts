import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { IsStrongPassword } from '@shared/decorators/is-strong-password.decorator';
import { PASSWORD_POLICY } from '@shared/utils/password-policy.util';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token sent to the user via email' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    minLength: PASSWORD_POLICY.minLength,
    maxLength: PASSWORD_POLICY.maxLength,
    description: 'New password (same policy as register)',
  })
  @IsString()
  @IsStrongPassword()
  newPassword: string;
}
