import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { TELEMETRY_MAX_HOURS } from '../../services/telemetry-buckets';

export class RobotTelemetryQueryDto {
  @ApiPropertyOptional({ default: TELEMETRY_MAX_HOURS, minimum: 1, maximum: TELEMETRY_MAX_HOURS })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(TELEMETRY_MAX_HOURS)
  hours: number = TELEMETRY_MAX_HOURS;
}
