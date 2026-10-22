import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClientsRepository } from '../repositories/clients.repository.interface';
import { ClientStatus } from '../entities/client.entity';
import { ClientResponseDto, toClientDto } from '../http/dto/client-response.dto';

interface UpdateClientInput {
  id: string;
  name?: string;
  status?: ClientStatus;
}

@Injectable()
export class UpdateClientUseCase {
  constructor(private clients: ClientsRepository) {}

  async execute(input: UpdateClientInput): Promise<ClientResponseDto> {
    const client = await this.clients.findById(input.id);
    if (!client) throw new NotFoundException('Client not found');
    if (client.isInternal && input.status !== undefined && input.status !== 'active') {
      throw new BadRequestException('The internal client is always active');
    }

    const updated = await this.clients.update(input.id, {
      name: input.name,
      status: input.status,
    });
    return toClientDto(updated);
  }
}
