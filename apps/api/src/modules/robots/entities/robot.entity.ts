import type { Pose, RobotMode } from '@hostly/contracts';

export const ROBOT_STATUSES = ['pending', 'active', 'revoked'] as const;

export type RobotStatus = (typeof ROBOT_STATUSES)[number];

export type RobotModel = 'luckibot_plus';

// The last telemetry the robot sent; the history lives in TelemetrySnapshot.
export interface RobotLastTelemetry {
  at: Date;
  battery: number | null;
  charging: boolean | null;
  pose: Pose | null;
  mode: RobotMode;
  emergency: boolean;
  nowPlayingAssetId: string | null;
}

// No device token hash: it never leaves the repository.
export class Robot {
  id: string;
  organizationId: string;
  clientId: string;
  siteId: string;
  serial: string;
  model: RobotModel;
  name: string;
  romVersion: string | null;
  appVersion: string | null;
  manifestVersion: string | null;
  status: RobotStatus;
  online: boolean;
  lastSeenAt: Date | null;
  telemetry: RobotLastTelemetry | null;
  createdAt: Date;
  updatedAt: Date;
}
