import type { TelemetrySample } from '../services/telemetry-buckets';

// Read side of the telemetry history (TelemetrySnapshot); robot-link writes it.
export abstract class TelemetryHistoryRepository {
  // Samples of the robot since the given time, oldest first, limited to the current scope: a client user only gets
  // the rows recorded while the robot was with their client.
  abstract findSince(robotId: string, since: Date): Promise<TelemetrySample[]>;
}
