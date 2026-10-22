import { PrismaHealthIndicator } from './prisma.indicator';
import { PrismaService } from '@shared/database/prisma.service';
import type { HealthIndicatorService } from '@nestjs/terminus';

describe('PrismaHealthIndicator', () => {
  let prisma: { $queryRaw: jest.Mock };
  let healthIndicator: jest.Mocked<HealthIndicatorService>;
  let upMock: jest.Mock;
  let downMock: jest.Mock;
  let indicator: PrismaHealthIndicator;

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn() };
    upMock = jest.fn().mockReturnValue({ database: { status: 'up' } });
    downMock = jest.fn().mockReturnValue({ database: { status: 'down' } });
    healthIndicator = {
      check: jest.fn().mockReturnValue({ up: upMock, down: downMock }),
    };
    indicator = new PrismaHealthIndicator(prisma as unknown as PrismaService, healthIndicator);
  });

  it('returns up when SELECT 1 succeeds', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const result = await indicator.pingCheck('database');
    expect(healthIndicator.check).toHaveBeenCalledWith('database');
    expect(upMock).toHaveBeenCalled();
    expect(result).toEqual({ database: { status: 'up' } });
  });

  it('returns down with the error message when query throws', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    await indicator.pingCheck('database');
    expect(downMock).toHaveBeenCalledWith({ message: 'connection refused' });
  });

  it('uses a generic message when error is not an Error instance', async () => {
    prisma.$queryRaw.mockRejectedValue('string failure');
    await indicator.pingCheck('database');
    expect(downMock).toHaveBeenCalledWith({ message: 'Database unreachable' });
  });
});
