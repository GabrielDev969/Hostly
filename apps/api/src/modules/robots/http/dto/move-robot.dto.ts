import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MoveRobotDto {
  @ApiProperty({ format: 'uuid', description: 'Site of any client of the organization' })
  @IsUUID('4')
  siteId: string;
}
