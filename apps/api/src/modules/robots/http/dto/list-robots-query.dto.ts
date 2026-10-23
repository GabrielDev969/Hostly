import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { ROBOT_STATUSES, type RobotStatus } from '../../entities/robot.entity';

export class ListRobotsQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Only the robots of this client' })
  @IsOptional()
  @IsUUID('4')
  clientId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Only the robots of this site' })
  @IsOptional()
  @IsUUID('4')
  siteId?: string;

  @ApiPropertyOptional({ enum: ROBOT_STATUSES })
  @IsOptional()
  @IsIn(ROBOT_STATUSES)
  status?: RobotStatus;
}
