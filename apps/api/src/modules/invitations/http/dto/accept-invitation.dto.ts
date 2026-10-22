import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Length } from 'class-validator';

export class AcceptInvitationDto {
  @ApiProperty({ description: 'Invitation token received via email' })
  @IsString()
  @IsNotEmpty()
  @Length(64, 64)
  token: string;
}
