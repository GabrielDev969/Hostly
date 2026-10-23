import { Injectable, NotFoundException } from '@nestjs/common';
import { RobotsRepository } from '../repositories/robots.repository.interface';
import { TelemetryHistoryRepository } from '../repositories/telemetry-history.repository.interface';
import {
  RobotTelemetryHistoryDto,
  toTelemetryHistoryDto,
} from '../http/dto/robot-telemetry-history.dto';
import { bucketTelemetry, telemetryWindow } from '../services/telemetry-buckets';

@Injectable()
export class GetRobotTelemetryUseCase {
  constructor(
    private robots: RobotsRepository,
    private history: TelemetryHistoryRepository,
  ) {}

  // A robot outside the scope is a 404, history included.
  async execute(input: {
    id: string;
    hours: number;
    now?: Date;
  }): Promise<RobotTelemetryHistoryDto> {
    const robot = await this.robots.findById(input.id);
    if (!robot) throw new NotFoundException('Robot not found');
    const window = telemetryWindow(input.now ?? new Date(), input.hours);
    const samples = await this.history.findSince(robot.id, window.from);
    return toTelemetryHistoryDto(window, bucketTelemetry(samples, window));
  }
}
