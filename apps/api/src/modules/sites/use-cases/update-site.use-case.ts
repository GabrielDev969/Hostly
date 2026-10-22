import { Injectable, NotFoundException } from '@nestjs/common';
import { SitesRepository } from '../repositories/sites.repository.interface';
import { SiteResponseDto, toSiteDto } from '../http/dto/site-response.dto';

interface UpdateSiteInput {
  id: string;
  name?: string;
  timezone?: string;
  address?: string | null;
}

@Injectable()
export class UpdateSiteUseCase {
  constructor(private sites: SitesRepository) {}

  async execute(input: UpdateSiteInput): Promise<SiteResponseDto> {
    const site = await this.sites.findById(input.id);
    if (!site) throw new NotFoundException('Site not found');

    const updated = await this.sites.update(input.id, {
      name: input.name,
      timezone: input.timezone,
      address: input.address,
    });
    return toSiteDto(updated);
  }
}
