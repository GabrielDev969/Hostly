import { Injectable } from '@nestjs/common';
import { RobotsFilter, RobotsRepository } from '../repositories/robots.repository.interface';
import { RobotResponseDto, toRobotDto } from '../http/dto/robot-response.dto';

@Injectable()
export class ListRobotsUseCase {
  constructor(private robots: RobotsRepository) {}

  async execute(filter: RobotsFilter): Promise<RobotResponseDto[]> {
    return (await this.robots.findMany(filter)).map(toRobotDto);
  }
}
