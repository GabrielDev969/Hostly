import { ApiProperty } from '@nestjs/swagger';
import {
  ROBOT_STATUSES,
  Robot,
  type RobotModel,
  type RobotStatus,
} from '../../entities/robot.entity';

export class RobotResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'LB0123456789' })
  serial: string;

  @ApiProperty({ enum: ['luckibot_plus'] })
  model: RobotModel;

  @ApiProperty({ example: 'Robot Piso L2' })
  name: string;

  @ApiProperty({ format: 'uuid' })
  clientId: string;

  @ApiProperty({ format: 'uuid' })
  siteId: string;

  @ApiProperty({
    enum: ROBOT_STATUSES,
    description: 'pending until the robot fetches its token; revoked after a revoke',
  })
  status: RobotStatus;

  @ApiProperty({ nullable: true, type: String, description: 'Reported by the robot' })
  romVersion: string | null;

  @ApiProperty({ nullable: true, type: String, description: 'Reported by the robot' })
  appVersion: string | null;

  @ApiProperty({ example: '2026-05-09T12:34:56.789Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-05-09T12:34:56.789Z' })
  updatedAt: Date;
}

export function toRobotDto(robot: Robot): RobotResponseDto {
  return {
    id: robot.id,
    serial: robot.serial,
    model: robot.model,
    name: robot.name,
    clientId: robot.clientId,
    siteId: robot.siteId,
    status: robot.status,
    romVersion: robot.romVersion,
    appVersion: robot.appVersion,
    createdAt: robot.createdAt,
    updatedAt: robot.updatedAt,
  };
}
