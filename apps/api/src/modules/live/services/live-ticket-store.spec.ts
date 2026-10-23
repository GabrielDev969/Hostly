import { ServiceUnavailableException } from '@nestjs/common';
import { LIVE_TICKET_PREFIX, RedisLiveTicketStore, type LiveRedis } from './live-ticket-store';

describe('RedisLiveTicketStore', () => {
  const viewer = { userId: 'u1', organizationId: 'o1', workspaceId: 'w1', clientId: null };

  it('saves with an expiry and takes a ticket once', async () => {
    const data = new Map<string, string>();
    const redis: LiveRedis = {
      set: jest.fn((key: string, value: string) => {
        data.set(key, value);
        return Promise.resolve('OK' as const);
      }),
      getdel: jest.fn((key: string) => {
        const value = data.get(key) ?? null;
        data.delete(key);
        return Promise.resolve(value);
      }),
      quit: jest.fn(),
    };
    const store = new RedisLiveTicketStore(redis);

    await store.save('h1', viewer, 30_000);
    expect(redis.set).toHaveBeenCalledWith(
      `${LIVE_TICKET_PREFIX}h1`,
      expect.any(String),
      'PX',
      30_000,
    );
    await expect(store.take('h1')).resolves.toEqual(viewer);
    await expect(store.take('h1')).resolves.toBeNull();
  });

  it('fails closed with 503 when Redis is down', async () => {
    const down = () => Promise.reject(new Error("Stream isn't writeable"));
    const store = new RedisLiveTicketStore({ set: down, getdel: down, quit: jest.fn() });

    await expect(store.save('h1', viewer, 1_000)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(store.take('h1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
