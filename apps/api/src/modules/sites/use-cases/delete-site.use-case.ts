import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SitesRepository } from '../repositories/sites.repository.interface';

@Injectable()
export class DeleteSiteUseCase {
  constructor(private sites: SitesRepository) {}

  async execute(id: string): Promise<void> {
    const site = await this.sites.findById(id);
    if (!site) throw new NotFoundException('Site not found');
    // Deleting is soft, so the robots' foreign key never fires: a robot still here blocks it.
    if ((await this.sites.countRobots(id)) > 0) {
      throw new ConflictException('Site still has robots; move them first');
    }
    await this.sites.softDelete(id);
  }
}
