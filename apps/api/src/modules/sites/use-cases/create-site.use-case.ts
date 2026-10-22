import { Injectable, NotFoundException } from '@nestjs/common';
import { ClientsRepository } from '@modules/clients/repositories/clients.repository.interface';
import { SitesRepository } from '../repositories/sites.repository.interface';
import { SiteResponseDto, toSiteDto } from '../http/dto/site-response.dto';

interface CreateSiteInput {
  clientId: string;
  name: string;
  timezone: string;
  address?: string;
}

@Injectable()
export class CreateSiteUseCase {
  constructor(
    private sites: SitesRepository,
    private clients: ClientsRepository,
  ) {}

  async execute(input: CreateSiteInput): Promise<SiteResponseDto> {
    const client = await this.clients.findById(input.clientId);
    if (!client) throw new NotFoundException('Client not found');

    const site = await this.sites.create({
      clientId: client.id,
      name: input.name,
      timezone: input.timezone,
      address: input.address ?? null,
    });
    return toSiteDto(site);
  }
}
