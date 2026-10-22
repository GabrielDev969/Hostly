import { Injectable } from '@nestjs/common';
import { SitesRepository } from '../repositories/sites.repository.interface';
import { SiteResponseDto, toSiteDto } from '../http/dto/site-response.dto';

@Injectable()
export class ListSitesUseCase {
  constructor(private sites: SitesRepository) {}

  async execute(input: { clientId?: string }): Promise<SiteResponseDto[]> {
    const sites = await this.sites.findMany({ clientId: input.clientId });
    return sites.map((s) => toSiteDto(s));
  }
}
