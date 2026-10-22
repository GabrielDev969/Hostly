import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Length } from 'class-validator';

export class EnableTwoFactorDto {
  @ApiProperty({ description: 'Current user password' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit TOTP code from the authenticator app',
  })
  @IsString()
  @Length(6, 6, { message: 'Code must be 6 digits' })
  code: string;
}
