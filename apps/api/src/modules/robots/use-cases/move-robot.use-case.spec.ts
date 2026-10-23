import { NotFoundException } from '@nestjs/common';
import { SitesRepository } from '@modules/sites/repositories/sites.repository.interface';
import { MoveRobotUseCase } from './move-robot.use-case';
import { RobotsRepository } from '../repositories/robots.repository.interface';
import { Robot } from '../entities/robot.entity';

describe('MoveRobotUseCase', () => {
  let robots: jest.Mocked<RobotsRepository>;
  let sites: jest.Mocked<SitesRepository>;
  let useCase: MoveRobotUseCase;

  beforeEach(() => {
    robots = {
      findMany: jest.fn(),
      findById: jest.fn().mockResolvedValue({ id: 'r1', siteId: 's1', clientId: 'c1' }),
      findBySerial: jest.fn(),
      update: jest.fn((id, data) => Promise.resolve({ id, ...data } as Robot)),
      revoke: jest.fn(),
      findActiveByTokenHash: jest.fn(),
    };
    sites = {
      findMany: jest.fn(),
      findById: jest.fn().mockResolvedValue({ id: 's9', clientId: 'c9' }),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      countRobots: jest.fn(),
    };
    useCase = new MoveRobotUseCase(robots, sites);
  });

  it('moves the robot with the client of the new site', async () => {
    await useCase.execute({ id: 'r1', siteId: 's9' });

    expect(robots.update).toHaveBeenCalledWith('r1', { siteId: 's9', clientId: 'c9' });
  });

  it('throws 404 when the robot is not in scope', async () => {
    robots.findById.mockResolvedValue(null);

    await expect(useCase.execute({ id: 'r1', siteId: 's9' })).rejects.toThrow(
      new NotFoundException('Robot not found'),
    );
  });

  it('throws 404 for a site of another organization or deleted', async () => {
    sites.findById.mockResolvedValue(null);

    await expect(useCase.execute({ id: 'r1', siteId: 's9' })).rejects.toThrow(
      new NotFoundException('Site not found'),
    );
    expect(robots.update).not.toHaveBeenCalled();
  });
});
