import { QueueHealthIndicator } from './queue.indicator';
import type { Queue } from 'bullmq';
import type { HealthIndicatorService } from '@nestjs/terminus';

describe('QueueHealthIndicator', () => {
  let queue: { client: Promise<{ ping: jest.Mock }>; name: string };
  let pingMock: jest.Mock;
  let healthIndicator: jest.Mocked<HealthIndicatorService>;
  let upMock: jest.Mock;
  let downMock: jest.Mock;
  let indicator: QueueHealthIndicator;

  beforeEach(() => {
    pingMock = jest.fn();
    queue = {
      client: Promise.resolve({ ping: pingMock }),
      name: 'emails',
    };
    upMock = jest.fn().mockImplementation((meta) => ({ queue: meta }));
    downMock = jest.fn().mockImplementation((meta) => ({ queue: meta }));
    healthIndicator = {
      check: jest.fn().mockReturnValue({ up: upMock, down: downMock }),
    };
    indicator = new QueueHealthIndicator(queue as unknown as Queue, healthIndicator);
  });

  it('returns up with the queue name when redis ping returns PONG', async () => {
    pingMock.mockResolvedValue('PONG');
    await indicator.pingCheck('queue');
    expect(healthIndicator.check).toHaveBeenCalledWith('queue');
    expect(upMock).toHaveBeenCalledWith({ queue: 'emails' });
  });

  it('returns down when ping returns a non-PONG reply', async () => {
    pingMock.mockResolvedValue('NOPE');
    await indicator.pingCheck('queue');
    expect(downMock).toHaveBeenCalledWith({
      message: 'Queue redis reply: NOPE',
    });
  });

  it('returns down with the error message when the client throws', async () => {
    pingMock.mockRejectedValue(new Error('queue unreachable'));
    await indicator.pingCheck('queue');
    expect(downMock).toHaveBeenCalledWith({ message: 'queue unreachable' });
  });
});
