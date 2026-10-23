import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ClientsRepository } from '../repositories/clients.repository.interface';

@Injectable()
export class DeleteClientUseCase {
  constructor(private clients: ClientsRepository) {}

  async execute(id: string): Promise<void> {
    const client = await this.clients.findById(id);
    if (!client) throw new NotFoundException('Client not found');
    if (client.isInternal) throw new ConflictException('The internal client cannot be deleted');

    // Deleting is soft, so foreign keys never fire: anything still pointing here blocks it.
    const dependents = await this.clients.softDeleteUnlessUsed(id);
    const blocking = Object.entries(dependents)
      .filter(([, count]) => count > 0)
      .map(([kind]) => kind);
    if (blocking.length > 0) {
      throw new ConflictException(`Client still has ${blocking.join(', ')}; remove them first`);
    }
  }
}
