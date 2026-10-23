import { ApiProperty } from '@nestjs/swagger';
import { RobotResponseDto } from './robot-response.dto';

export class PairingLookupResponseDto {
  @ApiProperty({ example: 'LB0123456789', description: 'Serial the robot reported' })
  serial: string;

  @ApiProperty({ example: '2026-05-09T12:44:56.789Z' })
  expiresAt: Date;

  @ApiProperty({
    type: RobotResponseDto,
    nullable: true,
    description: 'The organization robot with this serial; pairing again replaces its token',
  })
  robot: RobotResponseDto | null;
}
