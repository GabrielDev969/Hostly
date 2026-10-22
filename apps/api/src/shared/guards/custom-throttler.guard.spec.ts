import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Reflector } from '@nestjs/core';
import { CustomThrottlerGuard } from './custom-throttler.guard';

describe('CustomThrottlerGuard', () => {
  const makeGuard = () =>
    new CustomThrottlerGuard({ throttlers: [] }, {} as ThrottlerStorage, {} as Reflector);

  const callGetTracker = (
    guard: CustomThrottlerGuard,
    req: Record<string, unknown>,
  ): Promise<string> =>
    (
      guard as unknown as {
        getTracker: (r: Record<string, unknown>) => Promise<string>;
      }
    ).getTracker(req);

  it('returns user:<id> when req.user.id is present', async () => {
    const tracker = await callGetTracker(makeGuard(), {
      user: { id: 'user-123' },
      ip: '10.0.0.1',
    });
    expect(tracker).toBe('user:user-123');
  });

  it('falls back to ip:<req.ip> when req.user is undefined (public route)', async () => {
    const tracker = await callGetTracker(makeGuard(), { ip: '10.0.0.1' });
    expect(tracker).toBe('ip:10.0.0.1');
  });

  it('falls back to ip:<req.ip> when req.user exists but id is missing', async () => {
    const tracker = await callGetTracker(makeGuard(), {
      user: {},
      ip: '10.0.0.1',
    });
    expect(tracker).toBe('ip:10.0.0.1');
  });

  it('returns ip:unknown when both user.id and ip are absent', async () => {
    const tracker = await callGetTracker(makeGuard(), {});
    expect(tracker).toBe('ip:unknown');
  });
});
