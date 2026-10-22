const pingMock = jest.fn();
const disconnectMock = jest.fn();
const ioredisCtor = jest.fn();

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((opts: unknown) => {
    ioredisCtor(opts);
    return { ping: pingMock, disconnect: disconnectMock };
  }),
}));

import { RedisHealthIndicator } from './redis.indicator';
import type { HealthIndicatorService } from '@nestjs/terminus';

describe('RedisHealthIndicator', () => {
  let healthIndicator: jest.Mocked<HealthIndicatorService>;
  let upMock: jest.Mock;
  let downMock: jest.Mock;
  let indicator: RedisHealthIndicator;

  beforeEach(() => {
    pingMock.mockReset();
    disconnectMock.mockReset();
    ioredisCtor.mockReset();
    upMock = jest.fn().mockReturnValue({ redis: { status: 'up' } });
    downMock = jest.fn().mockReturnValue({ redis: { status: 'down' } });
    healthIndicator = {
      check: jest.fn().mockReturnValue({ up: upMock, down: downMock }),
    };
    indicator = new RedisHealthIndicator(healthIndicator);
  });

  it('returns up when PING returns PONG', async () => {
    pingMock.mockResolvedValue('PONG');
    const result = await indicator.pingCheck('redis');
    expect(healthIndicator.check).toHaveBeenCalledWith('redis');
    expect(upMock).toHaveBeenCalled();
    expect(result).toEqual({ redis: { status: 'up' } });
  });

  it('returns down when PING returns something else', async () => {
    pingMock.mockResolvedValue('NOPE');
    await indicator.pingCheck('redis');
    expect(downMock).toHaveBeenCalledWith({
      message: 'Unexpected reply: NOPE',
    });
  });

  it('returns down with the error message when PING throws', async () => {
    pingMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await indicator.pingCheck('redis');
    expect(downMock).toHaveBeenCalledWith({ message: 'ECONNREFUSED' });
  });

  it('disconnects the client on module destroy', () => {
    indicator.onModuleDestroy();
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });
});
