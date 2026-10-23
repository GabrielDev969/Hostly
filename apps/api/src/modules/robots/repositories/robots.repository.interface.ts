import { Robot, RobotStatus } from '../entities/robot.entity';

export interface RobotsFilter {
  clientId?: string;
  siteId?: string;
  status?: RobotStatus;
}

export interface UpdateRobotData {
  name?: string;
}

export abstract class RobotsRepository {
  abstract findMany(filter: RobotsFilter): Promise<Robot[]>;
  abstract findById(id: string): Promise<Robot | null>;
  abstract findBySerial(serial: string): Promise<Robot | null>;
  abstract update(id: string, data: UpdateRobotData): Promise<Robot>;
  // Moves the robot and its client along with the site; null when the site is gone, checked under its row lock.
  abstract moveToSite(id: string, site: { id: string; clientId: string }): Promise<Robot | null>;
  // Drops the token and any approval still waiting for delivery.
  abstract revoke(id: string): Promise<Robot>;
  // Identity lookup across tenants: call it inside TenantContext.runAsSystem.
  abstract findActiveByTokenHash(deviceTokenHash: string): Promise<Robot | null>;
}
