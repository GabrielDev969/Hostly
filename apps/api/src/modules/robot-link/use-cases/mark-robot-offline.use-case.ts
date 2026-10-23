import { Injectable } from '@nestjs/common';
import { LiveEventBus, liveEvents } from '@modules/live/services/live-event-bus';
import { RobotPresenceRepository } from '../repositories/robot-presence.repository.interface';
import { RobotScopeService, type RobotSession } from '../services/robot-scope.service';

@Injectable()
export class MarkRobotOfflineUseCase {
  constructor(
    private scope: RobotScopeService,
    private presence: RobotPresenceRepository,
    private live: LiveEventBus,
  ) {}

  // The robot's socket closed. Runs even when its token was just revoked, which is often why it closed.
  async execute(session: RobotSession): Promise<void> {
    const at = new Date();
    const offline = await this.scope.runInOrganization(session, () =>
      this.presence.markOffline(session.robotId),
    );
    if (!offline) return;
    this.live.publish({
      organizationId: offline.organizationId,
      clientId: offline.clientId,
      event: liveEvents.offline(offline.robotId, at),
    });
  }
}
