import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class LookupPairingDto {
  @ApiProperty({ example: '042917', description: 'Six-digit code shown on the robot screen' })
  @Matches(/^\d{6}$/, { message: 'code must be six digits' })
  code: string;
}
