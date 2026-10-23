import { Injectable, NotFoundException } from '@nestjs/common';
import { RobotsRepository } from '../repositories/robots.repository.interface';
import { RobotResponseDto, toRobotDto } from '../http/dto/robot-response.dto';

@Injectable()
export class GetRobotUseCase {
  constructor(private robots: RobotsRepository) {}

  async execute(id: string): Promise<RobotResponseDto> {
    const robot = await this.robots.findById(id);
    if (!robot) throw new NotFoundException('Robot not found');
    return toRobotDto(robot);
  }
}
