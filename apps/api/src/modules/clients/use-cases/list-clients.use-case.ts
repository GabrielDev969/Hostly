import { Injectable } from '@nestjs/common';
import { ClientsRepository } from '../repositories/clients.repository.interface';
import { ClientStatus } from '../entities/client.entity';
import { ClientResponseDto, toClientDto } from '../http/dto/client-response.dto';

@Injectable()
export class ListClientsUseCase {
  constructor(private clients: ClientsRepository) {}

  async execute(input: { status?: ClientStatus }): Promise<ClientResponseDto[]> {
    const clients = await this.clients.findMany({ status: input.status });
    return clients.map((c) => toClientDto(c));
  }
}
