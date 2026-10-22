import { Injectable, NotFoundException } from '@nestjs/common';
import { SitesRepository } from '../repositories/sites.repository.interface';
import { SiteResponseDto, toSiteDto } from '../http/dto/site-response.dto';

@Injectable()
export class GetSiteUseCase {
  constructor(private sites: SitesRepository) {}

  async execute(id: string): Promise<SiteResponseDto> {
    const site = await this.sites.findById(id);
    if (!site) throw new NotFoundException('Site not found');
    return toSiteDto(site);
  }
}
