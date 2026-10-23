import { Injectable, NotFoundException } from '@nestjs/common';
import { SitesRepository } from '@modules/sites/repositories/sites.repository.interface';
import { RobotsRepository } from '../repositories/robots.repository.interface';
import { RobotResponseDto, toRobotDto } from '../http/dto/robot-response.dto';

@Injectable()
export class MoveRobotUseCase {
  constructor(
    private robots: RobotsRepository,
    private sites: SitesRepository,
  ) {}

  // The client follows the site, even across clients; the device token stays valid.
  async execute(input: { id: string; siteId: string }): Promise<RobotResponseDto> {
    const robot = await this.robots.findById(input.id);
    if (!robot) throw new NotFoundException('Robot not found');
    const site = await this.sites.findById(input.siteId);
    if (!site) throw new NotFoundException('Site not found');

    const moved = await this.robots.moveToSite(robot.id, site);
    if (!moved) throw new NotFoundException('Site not found');
    return toRobotDto(moved);
  }
}
