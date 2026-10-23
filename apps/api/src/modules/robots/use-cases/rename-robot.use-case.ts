import { Injectable, NotFoundException } from '@nestjs/common';
import { RobotsRepository } from '../repositories/robots.repository.interface';
import { RobotResponseDto, toRobotDto } from '../http/dto/robot-response.dto';

@Injectable()
export class RenameRobotUseCase {
  constructor(private robots: RobotsRepository) {}

  async execute(input: { id: string; name: string }): Promise<RobotResponseDto> {
    const robot = await this.robots.findById(input.id);
    if (!robot) throw new NotFoundException('Robot not found');
    return toRobotDto(await this.robots.update(input.id, { name: input.name }));
  }
}
