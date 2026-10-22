import { ApiProperty } from '@nestjs/swagger';
import { Site } from '../../entities/site.entity';

export class SiteResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  clientId: string;

  @ApiProperty({ example: 'Piso L2' })
  name: string;

  @ApiProperty({ example: 'America/Sao_Paulo', description: 'IANA time zone of the schedule' })
  timezone: string;

  @ApiProperty({ example: 'Av. Paulista, 1000', nullable: true, type: String })
  address: string | null;

  @ApiProperty({ example: '2026-05-09T12:34:56.789Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-05-09T12:34:56.789Z' })
  updatedAt: Date;
}

export function toSiteDto(site: Site): SiteResponseDto {
  return {
    id: site.id,
    clientId: site.clientId,
    name: site.name,
    timezone: site.timezone,
    address: site.address,
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  };
}
