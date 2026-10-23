import { ApiProperty } from '@nestjs/swagger';
import { robotModeSchema, type RobotMode } from '@hostly/contracts';
import {
  ROBOT_STATUSES,
  Robot,
  RobotLastTelemetry,
  type RobotModel,
  type RobotStatus,
} from '../../entities/robot.entity';

export class RobotPoseDto {
  @ApiProperty({ description: 'Meters on the current map' })
  x: number;

  @ApiProperty({ description: 'Meters on the current map' })
  y: number;

  @ApiProperty({ description: 'Radians' })
  theta: number;
}

export class RobotNowPlayingDto {
  @ApiProperty({ format: 'uuid' })
  assetId: string;
}

// Same shape as the telemetry payload of @hostly/contracts, plus when it arrived.
export class RobotTelemetryDto {
  @ApiProperty({ example: '2026-05-09T12:34:56.789Z', description: 'When the cloud received it' })
  at: Date;

  @ApiProperty({ nullable: true, type: Number, minimum: 0, maximum: 100 })
  battery: number | null;

  @ApiProperty({ nullable: true, type: Boolean })
  charging: boolean | null;

  @ApiProperty({ nullable: true, type: RobotPoseDto, description: 'Null when not localized' })
  pose: RobotPoseDto | null;

  @ApiProperty({ enum: robotModeSchema.options })
  mode: RobotMode;

  @ApiProperty({ nullable: true, type: RobotNowPlayingDto })
  nowPlaying: RobotNowPlayingDto | null;

  @ApiProperty()
  emergency: boolean;
}

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

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Last manifest version the robot reported; null before the first one',
  })
  manifestVersion: string | null;

  @ApiProperty({ description: 'Connected to the cloud socket right now' })
  online: boolean;

  @ApiProperty({ nullable: true, type: Date, description: 'Last message from the robot' })
  lastSeenAt: Date | null;

  @ApiProperty({
    nullable: true,
    type: RobotTelemetryDto,
    description: 'Last telemetry; null until the first one',
  })
  telemetry: RobotTelemetryDto | null;

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
    manifestVersion: robot.manifestVersion,
    online: robot.online,
    lastSeenAt: robot.lastSeenAt,
    telemetry: robot.telemetry ? toTelemetryDto(robot.telemetry) : null,
    createdAt: robot.createdAt,
    updatedAt: robot.updatedAt,
  };
}

function toTelemetryDto(telemetry: RobotLastTelemetry): RobotTelemetryDto {
  return {
    at: telemetry.at,
    battery: telemetry.battery,
    charging: telemetry.charging,
    pose: telemetry.pose,
    mode: telemetry.mode,
    nowPlaying: telemetry.nowPlayingAssetId ? { assetId: telemetry.nowPlayingAssetId } : null,
    emergency: telemetry.emergency,
  };
}
