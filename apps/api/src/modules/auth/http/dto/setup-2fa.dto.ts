import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class SetupTwoFactorDto {
  @ApiProperty({ description: 'Current user password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
