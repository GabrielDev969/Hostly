import { Injectable, Logger } from '@nestjs/common';
import { env } from 'src/config/env.config';
import { LiveEventBus, liveEvents } from '@modules/live/services/live-event-bus';
import { TenantContext } from '@shared/tenancy/tenant-context';
import { RobotPresenceRepository } from '../repositories/robot-presence.repository.interface';

@Injectable()
export class SweepStaleRobotsUseCase {
  private readonly logger = new Logger('SweepStaleRobots');

  constructor(
    private presence: RobotPresenceRepository,
    private live: LiveEventBus,
  ) {}

  // A connected robot refreshes lastSeenAt on every pong, so one silent for all its allowed missed pings is gone,
  // even if no socket here saw it leave (the API restarted, or it is connected to nothing at all).
  async execute(): Promise<number> {
    const at = new Date();
    const seenBefore = new Date(
      at.getTime() - env.ROBOT_SOCKET_PING_INTERVAL_MS * env.ROBOT_SOCKET_MISSED_PINGS,
    );
    const offline = await TenantContext.runAsSystem(() =>
      this.presence.markStaleOffline(seenBefore),
    );
    for (const robot of offline) {
      this.live.publish({
        organizationId: robot.organizationId,
        clientId: robot.clientId,
        event: liveEvents.offline(robot.robotId, at),
      });
    }
    if (offline.length > 0) {
      this.logger.log({
        msg: 'Marked stale robots offline',
        robotIds: offline.map((r) => r.robotId),
      });
    }
    return offline.length;
  }
}
