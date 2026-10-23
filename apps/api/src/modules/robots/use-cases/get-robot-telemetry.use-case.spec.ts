import { NotFoundException } from '@nestjs/common';
import { GetRobotTelemetryUseCase } from './get-robot-telemetry.use-case';
import { RobotsRepository } from '../repositories/robots.repository.interface';
import { TelemetryHistoryRepository } from '../repositories/telemetry-history.repository.interface';

describe('GetRobotTelemetryUseCase', () => {
  let robots: jest.Mocked<RobotsRepository>;
  let history: jest.Mocked<TelemetryHistoryRepository>;
  let useCase: GetRobotTelemetryUseCase;
  const now = new Date('2026-10-23T12:07:30.000Z');

  beforeEach(() => {
    robots = {
      findMany: jest.fn(),
      findById: jest.fn().mockResolvedValue({ id: 'r1' }),
      findBySerial: jest.fn(),
      update: jest.fn(),
      revoke: jest.fn(),
      findActiveByTokenHash: jest.fn(),
    };
    history = {
      findSince: jest.fn().mockResolvedValue([
        {
          ts: new Date('2026-10-23T11:31:00.000Z'),
          battery: 50,
          charging: false,
          mode: 'cruise',
        },
      ]),
    };
    useCase = new GetRobotTelemetryUseCase(robots, history);
  });

  it('reads the history since the start of the window and returns it in buckets', async () => {
    const result = await useCase.execute({ id: 'r1', hours: 2, now });

    expect(history.findSince).toHaveBeenCalledWith('r1', new Date('2026-10-23T10:10:00.000Z'));
    expect(result).toEqual({
      from: new Date('2026-10-23T10:10:00.000Z'),
      to: new Date('2026-10-23T12:10:00.000Z'),
      bucketMinutes: 5,
      points: [
        {
          at: new Date('2026-10-23T11:30:00.000Z'),
          battery: 50,
          charging: false,
          mode: 'cruise',
          samples: 1,
        },
      ],
    });
  });

  it('throws 404 without reading the history when the robot is not in scope', async () => {
    robots.findById.mockResolvedValue(null);

    await expect(useCase.execute({ id: 'r1', hours: 24, now })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(history.findSince).not.toHaveBeenCalled();
  });
});
