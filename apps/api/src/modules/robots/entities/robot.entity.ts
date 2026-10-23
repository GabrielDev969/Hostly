export const ROBOT_STATUSES = ['pending', 'active', 'revoked'] as const;

export type RobotStatus = (typeof ROBOT_STATUSES)[number];

export type RobotModel = 'luckibot_plus';

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
  status: RobotStatus;
  createdAt: Date;
  updatedAt: Date;
}
