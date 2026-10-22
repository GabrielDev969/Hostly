import { ApiProperty } from '@nestjs/swagger';
import { IsJWT, IsString, IsNotEmpty } from 'class-validator';

export class VerifyTwoFactorDto {
  @ApiProperty({ description: 'Challenge token received on login' })
  @IsJWT()
  challenge: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit TOTP code OR recovery code (XXXXX-XXXXX)',
  })
  @IsString()
  @IsNotEmpty()
  code: string;
}
