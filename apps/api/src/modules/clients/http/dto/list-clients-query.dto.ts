import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { CLIENT_STATUSES } from '../../entities/client.entity';
import type { ClientStatus } from '../../entities/client.entity';

export class ListClientsQueryDto {
  @ApiPropertyOptional({ enum: CLIENT_STATUSES })
  @IsOptional()
  @IsIn(CLIENT_STATUSES, { message: `status must be one of: ${CLIENT_STATUSES.join(', ')}` })
  status?: ClientStatus;
}
