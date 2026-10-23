import { Injectable } from '@nestjs/common';
import type { TelemetryPayload } from '@hostly/contracts';
import { LiveEventBus, liveEvents } from '@modules/live/services/live-event-bus';
import { RobotPresenceRepository } from '../repositories/robot-presence.repository.interface';
import { RobotScopeService, type RobotSession } from '../services/robot-scope.service';

@Injectable()
export class RecordTelemetryUseCase {
  constructor(
    private scope: RobotScopeService,
    private presence: RobotPresenceRepository,
    private live: LiveEventBus,
  ) {}

  // False when the token is no longer valid. A robot moved while the write ran keeps nothing of this message.
  async execute(session: RobotSession, telemetry: TelemetryPayload): Promise<boolean> {
    const at = new Date();
    const run = await this.scope.run(session, () =>
      this.presence.recordTelemetry(session.robotId, {
        battery: telemetry.battery,
        charging: telemetry.charging,
        pose: telemetry.pose,
        mode: telemetry.mode,
        emergency: telemetry.emergency,
        nowPlayingAssetId: telemetry.nowPlaying?.assetId ?? null,
        at,
      }),
    );
    if (!run) return false;
    if (!run.result) return true;

    const { organizationId, clientId } = run.robot;
    if (run.result.cameOnline) {
      this.live.publish({
        organizationId,
        clientId,
        event: liveEvents.online(session.robotId, at),
      });
    }
    this.live.publish({
      organizationId,
      clientId,
      event: liveEvents.telemetry(session.robotId, at, telemetry),
    });
    return true;
  }
}
