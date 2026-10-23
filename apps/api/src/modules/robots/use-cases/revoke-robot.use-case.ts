import { Injectable, NotFoundException } from '@nestjs/common';
import { RobotsRepository } from '../repositories/robots.repository.interface';
import { RobotResponseDto, toRobotDto } from '../http/dto/robot-response.dto';

@Injectable()
export class RevokeRobotUseCase {
  constructor(private robots: RobotsRepository) {}

  // Idempotent; pairing the robot again issues a new token.
  async execute(id: string): Promise<RobotResponseDto> {
    const robot = await this.robots.findById(id);
    if (!robot) throw new NotFoundException('Robot not found');
    return toRobotDto(await this.robots.revoke(id));
  }
}
