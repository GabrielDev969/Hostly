import { Injectable } from '@nestjs/common';
import { LiveEventBus, liveEvents } from '@modules/live/services/live-event-bus';
import { RobotPresenceRepository } from '../repositories/robot-presence.repository.interface';
import { RobotScopeService, type RobotSession } from '../services/robot-scope.service';

@Injectable()
export class TouchRobotUseCase {
  constructor(
    private scope: RobotScopeService,
    private presence: RobotPresenceRepository,
    private live: LiveEventBus,
  ) {}

  // A pong: the robot is still there. False when the token is no longer valid.
  async execute(session: RobotSession): Promise<boolean> {
    const at = new Date();
    const run = await this.scope.run(session, () => this.presence.touch(session.robotId, at));
    if (!run) return false;
    if (run.result?.cameOnline) {
      const { organizationId, clientId } = run.robot;
      this.live.publish({
        organizationId,
        clientId,
        event: liveEvents.online(session.robotId, at),
      });
    }
    return true;
  }
}
