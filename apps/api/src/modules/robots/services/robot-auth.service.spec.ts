import { CryptoUtil } from '@shared/utils/crypto.util';
import { TenantContext } from '@shared/tenancy/tenant-context';
import { RobotAuthService } from './robot-auth.service';
import { RobotsRepository } from '../repositories/robots.repository.interface';
import { Robot } from '../entities/robot.entity';
import { WorkspacesRepository } from '@modules/workspaces/repositories/workspaces.repository.interface';

describe('RobotAuthService', () => {
  let robots: jest.Mocked<RobotsRepository>;
  let workspaces: jest.Mocked<Pick<WorkspacesRepository, 'findOperatorWorkspaceId'>>;
  let service: RobotAuthService;

  beforeEach(() => {
    robots = {
      findMany: jest.fn(),
      findById: jest.fn(),
      findBySerial: jest.fn(),
      update: jest.fn(),
      moveToSite: jest.fn(),
      revoke: jest.fn(),
      findActiveByTokenHash: jest.fn().mockResolvedValue(null),
    };
    workspaces = { findOperatorWorkspaceId: jest.fn().mockResolvedValue('w1') };
    service = new RobotAuthService(robots, workspaces as unknown as WorkspacesRepository);
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

  it('finds the operator workspace of the robot, as system work', async () => {
    let system = false;
    workspaces.findOperatorWorkspaceId.mockImplementation(() => {
      system = TenantContext.isSystem;
      return Promise.resolve('w1');
    });

    await expect(service.operatorWorkspaceId('o1')).resolves.toBe('w1');
    expect(workspaces.findOperatorWorkspaceId).toHaveBeenCalledWith('o1');
    expect(system).toBe(true);
  });
});
