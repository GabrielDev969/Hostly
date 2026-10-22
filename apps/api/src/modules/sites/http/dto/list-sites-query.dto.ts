import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ListSitesQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Only the sites of this client' })
  @IsOptional()
  @IsUUID('4')
  clientId?: string;
}
