import { Injectable } from '@nestjs/common';
import { ClientsRepository } from '../repositories/clients.repository.interface';
import { ClientStatus } from '../entities/client.entity';
import { ClientResponseDto, toClientDto } from '../http/dto/client-response.dto';

interface CreateClientInput {
  name: string;
  status?: ClientStatus;
}

@Injectable()
export class CreateClientUseCase {
  constructor(private clients: ClientsRepository) {}

  async execute(input: CreateClientInput): Promise<ClientResponseDto> {
    const client = await this.clients.create({
      name: input.name,
      status: input.status ?? 'onboarding',
    });
    return toClientDto(client);
  }
}
