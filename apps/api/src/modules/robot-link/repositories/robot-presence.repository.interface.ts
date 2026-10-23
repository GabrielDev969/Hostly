import type { Pose, RobotMode } from '@hostly/contracts';

export interface HelloData {
  romVersion: string;
  appVersion: string;
  manifestVersion: string | null;
  at: Date;
}

export interface TelemetryData {
  battery: number | null;
  charging: boolean | null;
  pose: Pose | null;
  mode: RobotMode;
  emergency: boolean;
  nowPlayingAssetId: string | null;
  at: Date;
}

// What a robot write did; null when the robot is no longer active in the current scope (moved or revoked meanwhile).
export interface RobotWrite {
  cameOnline: boolean;
}

export interface WentOffline {
  robotId: string;
  organizationId: string;
  clientId: string;
}

// Presence and telemetry of the robot behind the socket. Writes run in the robot's own tenant scope.
export abstract class RobotPresenceRepository {
  abstract recordHello(robotId: string, data: HelloData): Promise<RobotWrite | null>;
  // Updates the last state and appends to the history, in one transaction.
  abstract recordTelemetry(robotId: string, data: TelemetryData): Promise<RobotWrite | null>;
  abstract touch(robotId: string, at: Date): Promise<RobotWrite | null>;
  // Null when the robot was already offline.
  abstract markOffline(robotId: string): Promise<WentOffline | null>;
  // Cross-tenant: call it inside TenantContext.runAsSystem.
  abstract markStaleOffline(seenBefore: Date): Promise<WentOffline[]>;
  // Cross-tenant: call it inside TenantContext.runAsSystem.
  abstract deleteTelemetryOlderThan(cutoff: Date): Promise<number>;
}
