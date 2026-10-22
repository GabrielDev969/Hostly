import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class TransferOwnershipDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Membership id of the user who will become the new owner',
  })
  @IsUUID()
  targetMemberId: string;

  @ApiProperty({
    description: 'Current owner password (step-up auth)',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}
