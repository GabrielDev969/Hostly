import { ApiProperty } from '@nestjs/swagger';
import { CLIENT_STATUSES, Client } from '../../entities/client.entity';
import type { ClientStatus } from '../../entities/client.entity';

export class ClientResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Shopping A' })
  name: string;

  @ApiProperty({ enum: CLIENT_STATUSES, example: 'active' })
  status: ClientStatus;

  @ApiProperty({
    example: false,
    description: "True for the operator's own robots (fair, demo, event); one per organization",
  })
  isInternal: boolean;

  @ApiProperty({ example: '2026-05-09T12:34:56.789Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-05-09T12:34:56.789Z' })
  updatedAt: Date;
}

export function toClientDto(client: Client): ClientResponseDto {
  return {
    id: client.id,
    name: client.name,
    status: client.status,
    isInternal: client.isInternal,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}
