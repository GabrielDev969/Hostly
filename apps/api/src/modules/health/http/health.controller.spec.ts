import { HealthController } from './health.controller';
import { HealthCheckService, type HealthCheckResult } from '@nestjs/terminus';
import { PrismaHealthIndicator } from '../indicators/prisma.indicator';
import { RedisHealthIndicator } from '../indicators/redis.indicator';
import { QueueHealthIndicator } from '../indicators/queue.indicator';

describe('HealthController', () => {
  let health: jest.Mocked<HealthCheckService>;
  let prismaIndicator: jest.Mocked<PrismaHealthIndicator>;
  let redisIndicator: jest.Mocked<RedisHealthIndicator>;
  let queueIndicator: jest.Mocked<QueueHealthIndicator>;
  let controller: HealthController;

  const okResult: HealthCheckResult = {
    status: 'ok',
    info: {},
    error: {},
    details: {},
  };

  beforeEach(() => {
    health = {
      check: jest.fn().mockResolvedValue(okResult),
    } as unknown as jest.Mocked<HealthCheckService>;
    prismaIndicator = {
      pingCheck: jest.fn(),
    } as unknown as jest.Mocked<PrismaHealthIndicator>;
    redisIndicator = {
      pingCheck: jest.fn(),
    } as unknown as jest.Mocked<RedisHealthIndicator>;
    queueIndicator = {
      pingCheck: jest.fn(),
    } as unknown as jest.Mocked<QueueHealthIndicator>;
    controller = new HealthController(health, prismaIndicator, redisIndicator, queueIndicator);
  });

  it('liveness returns the result of an empty check', async () => {
    const result = await controller.liveness();
    expect(health.check).toHaveBeenCalledWith([]);
    expect(result).toEqual(okResult);
  });

  it('readiness wires prisma, redis, and queue checks into terminus', async () => {
    await controller.readiness();
    const arg = health.check.mock.calls[0]![0];
    expect(arg).toHaveLength(3);

    await arg[0]!();
    expect(prismaIndicator.pingCheck).toHaveBeenCalledWith('database');

    await arg[1]!();
    expect(redisIndicator.pingCheck).toHaveBeenCalledWith('redis');

    await arg[2]!();
    expect(queueIndicator.pingCheck).toHaveBeenCalledWith('queue');
  });
});
