import { ApiProperty } from '@nestjs/swagger';
import { robotModeSchema, type RobotMode } from '@hostly/contracts';
import {
  TELEMETRY_BUCKET_MINUTES,
  type TelemetryPoint,
  type TelemetryWindow,
} from '../../services/telemetry-buckets';

export class RobotTelemetryPointDto {
  @ApiProperty({ example: '2026-05-09T12:35:00.000Z', description: 'Start of the bucket' })
  at: Date;

  @ApiProperty({
    nullable: true,
    type: Number,
    minimum: 0,
    maximum: 100,
    description: 'Average battery in the bucket; null when the robot did not report it',
  })
  battery: number | null;

  @ApiProperty({
    nullable: true,
    type: Boolean,
    description: 'What most samples of the bucket said',
  })
  charging: boolean | null;

  @ApiProperty({ enum: robotModeSchema.options, description: 'Mode of most samples of the bucket' })
  mode: RobotMode;

  @ApiProperty({ description: 'Telemetry messages in the bucket' })
  samples: number;
}

export class RobotTelemetryHistoryDto {
  @ApiProperty({ example: '2026-05-08T12:40:00.000Z' })
  from: Date;

  @ApiProperty({ example: '2026-05-09T12:40:00.000Z', description: 'End of the current bucket' })
  to: Date;

  @ApiProperty({ example: TELEMETRY_BUCKET_MINUTES })
  bucketMinutes: number;

  @ApiProperty({
    type: [RobotTelemetryPointDto],
    description: 'Buckets with samples, oldest first; a missing bucket is time without telemetry',
  })
  points: RobotTelemetryPointDto[];
}

export function toTelemetryHistoryDto(
  window: TelemetryWindow,
  points: TelemetryPoint[],
): RobotTelemetryHistoryDto {
  return { from: window.from, to: window.to, bucketMinutes: TELEMETRY_BUCKET_MINUTES, points };
}
