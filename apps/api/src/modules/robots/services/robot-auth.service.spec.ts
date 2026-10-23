import { CryptoUtil } from '@shared/utils/crypto.util';
import { TenantContext } from '@shared/tenancy/tenant-context';
import { RobotAuthService } from './robot-auth.service';
import { RobotsRepository } from '../repositories/robots.repository.interface';
import { Robot } from '../entities/robot.entity';

describe('RobotAuthService', () => {
  let robots: jest.Mocked<RobotsRepository>;
  let service: RobotAuthService;

  beforeEach(() => {
    robots = {
      findMany: jest.fn(),
      findById: jest.fn(),
      findBySerial: jest.fn(),
      update: jest.fn(),
      revoke: jest.fn(),
      findActiveByTokenHash: jest.fn().mockResolvedValue(null),
    };
    service = new RobotAuthService(robots);
  });

  it('looks the robot up by the token hash, as system work', async () => {
    let system = false;
    robots.findActiveByTokenHash.mockImplementation(() => {
      system = TenantContext.isSystem;
      return Promise.resolve({ id: 'r1' } as Robot);
    });

    await expect(service.authenticate('raw-token')).resolves.toMatchObject({ id: 'r1' });
    expect(robots.findActiveByTokenHash).toHaveBeenCalledWith(CryptoUtil.hashToken('raw-token'));
    expect(system).toBe(true);
  });

  it('returns null for an unknown or revoked token', async () => {
    await expect(service.authenticate('raw-token')).resolves.toBeNull();
  });
});
