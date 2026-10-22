import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Length } from 'class-validator';

export class DisableTwoFactorDto {
  @ApiProperty({ description: 'Current user password' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ example: '123456', description: 'Current TOTP code' })
  @IsString()
  @Length(6, 6)
  code: string;
}
