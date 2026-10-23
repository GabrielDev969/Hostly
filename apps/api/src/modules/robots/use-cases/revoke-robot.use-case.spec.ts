import { NotFoundException } from '@nestjs/common';
import { RevokeRobotUseCase } from './revoke-robot.use-case';
import { RenameRobotUseCase } from './rename-robot.use-case';
import { RobotsRepository } from '../repositories/robots.repository.interface';
import { Robot } from '../entities/robot.entity';
import { RobotTokenEvents } from '../services/robot-token-events.service';

describe('RevokeRobotUseCase and RenameRobotUseCase', () => {
  let robots: jest.Mocked<RobotsRepository>;
  let tokenEvents: RobotTokenEvents;

  beforeEach(() => {
    robots = {
      findMany: jest.fn(),
      findById: jest.fn().mockResolvedValue({ id: 'r1', status: 'active' }),
      findBySerial: jest.fn(),
      update: jest.fn((id, data) => Promise.resolve({ id, ...data } as Robot)),
      revoke: jest.fn().mockResolvedValue({ id: 'r1', status: 'revoked' }),
      findActiveByTokenHash: jest.fn(),
    };
    tokenEvents = new RobotTokenEvents();
    jest.spyOn(tokenEvents, 'emit');
  });

  it('revokes a robot in scope and closes its socket', async () => {
    const result = await new RevokeRobotUseCase(robots, tokenEvents).execute('r1');

    expect(robots.revoke).toHaveBeenCalledWith('r1');
    expect(result.status).toBe('revoked');
    expect(tokenEvents.emit).toHaveBeenCalledWith({ robotId: 'r1', activeTokenHash: null });
  });

  it('renames a robot in scope', async () => {
    await new RenameRobotUseCase(robots).execute({ id: 'r1', name: 'Robot L3' });

    expect(robots.update).toHaveBeenCalledWith('r1', { name: 'Robot L3' });
  });

  it('throws 404 for a robot out of scope', async () => {
    robots.findById.mockResolvedValue(null);

    await expect(new RevokeRobotUseCase(robots, tokenEvents).execute('r1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      new RenameRobotUseCase(robots).execute({ id: 'r1', name: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(robots.revoke).not.toHaveBeenCalled();
    expect(tokenEvents.emit).not.toHaveBeenCalled();
    expect(robots.update).not.toHaveBeenCalled();
  });
});
