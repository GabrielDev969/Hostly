import { Injectable } from '@nestjs/common';
import { WorkspacesRepository } from '@modules/workspaces/repositories/workspaces.repository.interface';
import { CryptoUtil } from '@shared/utils/crypto.util';
import { TenantContext } from '@shared/tenancy/tenant-context';
import { Robot } from '../entities/robot.entity';
import { RobotsRepository } from '../repositories/robots.repository.interface';

// Resolves a device token to its robot, for the routes and the socket the robot uses.
@Injectable()
export class RobotAuthService {
  constructor(
    private robots: RobotsRepository,
    private workspaces: WorkspacesRepository,
  ) {}

  async authenticate(deviceToken: string): Promise<Robot | null> {
    return this.authenticateHash(CryptoUtil.hashToken(deviceToken));
  }

  // The robot has no tenant scope yet: this identity lookup is the only way it gets one.
  async authenticateHash(deviceTokenHash: string): Promise<Robot | null> {
    return TenantContext.runAsSystem(() => this.robots.findActiveByTokenHash(deviceTokenHash));
  }

  // The robot's tenant scope needs a workspace: the operator's, which never changes for a robot.
  async operatorWorkspaceId(organizationId: string): Promise<string | null> {
    return TenantContext.runAsSystem(() => this.workspaces.findOperatorWorkspaceId(organizationId));
  }
}
