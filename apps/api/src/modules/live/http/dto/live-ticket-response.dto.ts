import { ApiProperty } from '@nestjs/swagger';

export class LiveTicketResponseDto {
  @ApiProperty({
    description:
      'Single-use ticket for the live socket, sent as the subprotocol "ticket.<ticket>"; never put it in a URL',
  })
  ticket: string;

  @ApiProperty({ example: '2026-05-09T12:34:56.789Z' })
  expiresAt: Date;
}
