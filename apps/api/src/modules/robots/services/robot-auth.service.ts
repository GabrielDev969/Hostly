import { Injectable } from '@nestjs/common';
import { CryptoUtil } from '@shared/utils/crypto.util';
import { TenantContext } from '@shared/tenancy/tenant-context';
import { Robot } from '../entities/robot.entity';
import { RobotsRepository } from '../repositories/robots.repository.interface';

// Resolves a device token to its robot, for the routes and the socket the robot uses.
@Injectable()
export class RobotAuthService {
  constructor(private robots: RobotsRepository) {}

  // The robot has no tenant scope yet: this identity lookup is the only way it gets one.
  async authenticate(deviceToken: string): Promise<Robot | null> {
    const hash = CryptoUtil.hashToken(deviceToken);
    return TenantContext.runAsSystem(() => this.robots.findActiveByTokenHash(hash));
  }
}
