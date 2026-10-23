import { Injectable } from '@nestjs/common';
import type { RobotConnection } from './robot-connection';

// The one connection that speaks for each robot. One API instance in v1, so it lives in memory; with more
// instances it moves to Redis, so a new connection anywhere replaces the old one.
export abstract class RobotConnectionRegistry {
  // Returns the connection it replaced, if any.
  abstract register(robotId: string, connection: RobotConnection): RobotConnection | null;
  // False when a newer connection already took over the robot.
  abstract unregister(robotId: string, connection: RobotConnection): boolean;
}

@Injectable()
export class InMemoryRobotConnectionRegistry extends RobotConnectionRegistry {
  private readonly current = new Map<string, RobotConnection>();

  constructor() {
    super();
  }

  register(robotId: string, connection: RobotConnection): RobotConnection | null {
    const previous = this.current.get(robotId) ?? null;
    this.current.set(robotId, connection);
    return previous === connection ? null : previous;
  }

  unregister(robotId: string, connection: RobotConnection): boolean {
    if (this.current.get(robotId) !== connection) return false;
    this.current.delete(robotId);
    return true;
  }
}
