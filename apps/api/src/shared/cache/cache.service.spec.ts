import { createCache } from 'cache-manager';
import { CacheService, NamespaceVersionPipeline, NamespaceVersionStore } from './cache.service';

class FakeNamespaceVersionStore implements NamespaceVersionStore {
  private readonly store = new Map<string, number>();

  get(key: string): Promise<string | null> {
    const v = this.store.get(key);
    return Promise.resolve(v === undefined ? null : String(v));
  }

  multi(): NamespaceVersionPipeline {
    const ops: Array<() => unknown> = [];
    const store = this.store;
    const pipeline: NamespaceVersionPipeline = {
      setnx(key: string, value: string) {
        ops.push(() => {
          if (store.has(key)) return 0;
          store.set(key, Number(value));
          return 1;
        });
        return pipeline;
      },
      incr(key: string) {
        ops.push(() => {
          const next = (store.get(key) ?? 0) + 1;
          store.set(key, next);
          return next;
        });
        return pipeline;
      },
      exec() {
        return Promise.resolve(ops.map((op) => [null, op()]));
      },
    };
    return pipeline;
  }
}

describe('CacheService', () => {
  let svc: CacheService;

  beforeEach(() => {
    const cache = createCache();
    svc = new CacheService(cache);
  });

  it('set/get round-trips a value', async () => {
    await svc.set('k', { v: 1 });
    expect(await svc.get<{ v: number }>('k')).toEqual({ v: 1 });
  });

  it('get returns null for missing keys', async () => {
    expect(await svc.get('missing')).toBeNull();
  });

  it('del removes a value', async () => {
    await svc.set('k', 1);
    await svc.del('k');
    expect(await svc.get('k')).toBeNull();
  });

  it('wrap returns cached value on second call without invoking fn', async () => {
    const fn = jest.fn().mockResolvedValue('value');
    expect(await svc.wrap('k', fn, 60_000)).toBe('value');
    expect(await svc.wrap('k', fn, 60_000)).toBe('value');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('wrap re-invokes fn when cached value is null', async () => {
    const fn = jest.fn().mockResolvedValue(null);
    await svc.wrap('k', fn, 60_000);
    await svc.wrap('k', fn, 60_000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('getNamespaceVersion defaults to 1 when unset', async () => {
    expect(await svc.getNamespaceVersion('users')).toBe(1);
  });

  it('bumpNamespace increments the version', async () => {
    await svc.bumpNamespace('users');
    expect(await svc.getNamespaceVersion('users')).toBe(2);
    await svc.bumpNamespace('users');
    expect(await svc.getNamespaceVersion('users')).toBe(3);
  });

  it('buildKey embeds the current namespace version', async () => {
    expect(await svc.buildKey('users', 'id:123')).toBe('users:v1:id:123');
    await svc.bumpNamespace('users');
    expect(await svc.buildKey('users', 'id:123')).toBe('users:v2:id:123');
  });

  describe('with Redis namespace-version store', () => {
    let nsver: FakeNamespaceVersionStore;
    let redisSvc: CacheService;

    beforeEach(() => {
      const cache = createCache();
      nsver = new FakeNamespaceVersionStore();
      redisSvc = new CacheService(cache, nsver);
    });

    it('first bump initializes via SETNX+INCR and leaves version at 2', async () => {
      expect(await redisSvc.getNamespaceVersion('users')).toBe(1);
      await redisSvc.bumpNamespace('users');
      expect(await redisSvc.getNamespaceVersion('users')).toBe(2);
    });

    it('subsequent bumps increment monotonically (atomic)', async () => {
      await redisSvc.bumpNamespace('users');
      await redisSvc.bumpNamespace('users');
      await redisSvc.bumpNamespace('users');
      expect(await redisSvc.getNamespaceVersion('users')).toBe(4);
    });

    it('100 concurrent bumps end on a distinct, monotonic counter (no lost updates)', async () => {
      await Promise.all(Array.from({ length: 100 }, () => redisSvc.bumpNamespace('users')));
      expect(await redisSvc.getNamespaceVersion('users')).toBe(101);
    });

    it('falls back to default version when the stored value is corrupt', async () => {
      const exec = nsver.multi();
      exec.setnx('__nsver__:users', 'not-a-number');
      await exec.exec();
      expect(await redisSvc.getNamespaceVersion('users')).toBe(1);
    });
  });
});
