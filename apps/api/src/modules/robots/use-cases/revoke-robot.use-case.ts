import { Injectable, NotFoundException } from '@nestjs/common';
import { RobotsRepository } from '../repositories/robots.repository.interface';
import { RobotResponseDto, toRobotDto } from '../http/dto/robot-response.dto';
import { RobotTokenEvents } from '../services/robot-token-events.service';

@Injectable()
export class RevokeRobotUseCase {
  constructor(
    private robots: RobotsRepository,
    private tokenEvents: RobotTokenEvents,
  ) {}

  // Idempotent; pairing the robot again issues a new token. An open socket closes right away.
  async execute(id: string): Promise<RobotResponseDto> {
    const robot = await this.robots.findById(id);
    if (!robot) throw new NotFoundException('Robot not found');
    const revoked = await this.robots.revoke(id);
    this.tokenEvents.emit({ robotId: id, activeTokenHash: null });
    return toRobotDto(revoked);
  }
}
