import { Injectable, NotFoundException } from '@nestjs/common';
import { SitesRepository } from '../repositories/sites.repository.interface';

@Injectable()
export class DeleteSiteUseCase {
  constructor(private sites: SitesRepository) {}

  async execute(id: string): Promise<void> {
    const site = await this.sites.findById(id);
    if (!site) throw new NotFoundException('Site not found');
    await this.sites.softDelete(id);
  }
}
