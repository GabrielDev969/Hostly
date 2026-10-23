import { Injectable } from '@nestjs/common';
import type { HelloPayload } from '@hostly/contracts';
import { LiveEventBus, liveEvents } from '@modules/live/services/live-event-bus';
import { RobotPresenceRepository } from '../repositories/robot-presence.repository.interface';
import { RobotScopeService, type RobotSession } from '../services/robot-scope.service';

@Injectable()
export class RecordRobotHelloUseCase {
  constructor(
    private scope: RobotScopeService,
    private presence: RobotPresenceRepository,
    private live: LiveEventBus,
  ) {}

  // False when the token is no longer valid.
  async execute(session: RobotSession, hello: HelloPayload): Promise<boolean> {
    const at = new Date();
    const run = await this.scope.run(session, () =>
      this.presence.recordHello(session.robotId, {
        romVersion: hello.romVersion,
        appVersion: hello.appVersion,
        manifestVersion: hello.manifestVersion,
        at,
      }),
    );
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
