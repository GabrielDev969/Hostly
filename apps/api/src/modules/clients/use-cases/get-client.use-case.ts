import { Injectable, NotFoundException } from '@nestjs/common';
import { ClientsRepository } from '../repositories/clients.repository.interface';
import { ClientResponseDto, toClientDto } from '../http/dto/client-response.dto';

@Injectable()
export class GetClientUseCase {
  constructor(private clients: ClientsRepository) {}

  async execute(id: string): Promise<ClientResponseDto> {
    const client = await this.clients.findById(id);
    if (!client) throw new NotFoundException('Client not found');
    return toClientDto(client);
  }
}
