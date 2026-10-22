import { createCache } from 'cache-manager';
import { CacheService } from './cache.service';
import { Cacheable } from './cacheable.decorator';
import { InvalidateCache } from './invalidate-cache.decorator';

class TestRepo {
  callCount = 0;

  constructor(protected readonly cacheService: CacheService) {}

  @Cacheable({
    namespace: 'test',
    key: (id: string) => `id:${id}`,
    ttlMs: 60_000,
  })
  async findById(id: string): Promise<{ id: string; n: number }> {
    await Promise.resolve();
    this.callCount++;
    return { id, n: this.callCount };
  }

  @InvalidateCache('test')
  async update(): Promise<void> {
    await Promise.resolve();
  }
}

class UninjectedRepo {
  callCount = 0;

  @Cacheable({
    namespace: 'test',
    key: (id: string) => `id:${id}`,
    ttlMs: 60_000,
  })
  async findById(id: string): Promise<{ id: string; n: number }> {
    await Promise.resolve();
    this.callCount++;
    return { id, n: this.callCount };
  }

  @InvalidateCache('test')
  async update(): Promise<void> {
    await Promise.resolve();
  }
}

describe('Cacheable + InvalidateCache decorators', () => {
  let svc: CacheService;
  let repo: TestRepo;

  beforeEach(() => {
    const cache = createCache();
    svc = new CacheService(cache);
    repo = new TestRepo(svc);
  });

  it('cache miss invokes the underlying method', async () => {
    const result = await repo.findById('a');
    expect(result).toEqual({ id: 'a', n: 1 });
    expect(repo.callCount).toBe(1);
  });

  it('cache hit returns cached value without invoking the method again', async () => {
    await repo.findById('a');
    const cached = await repo.findById('a');
    expect(cached).toEqual({ id: 'a', n: 1 });
    expect(repo.callCount).toBe(1);
  });

  it('different args produce different cache keys', async () => {
    await repo.findById('a');
    await repo.findById('b');
    expect(repo.callCount).toBe(2);
  });

  it('InvalidateCache bumps the namespace and forces a refetch', async () => {
    await repo.findById('a');
    await repo.update();
    const refetched = await repo.findById('a');
    expect(refetched).toEqual({ id: 'a', n: 2 });
    expect(repo.callCount).toBe(2);
  });

  it('@Cacheable throws a clear error when the host class does not inject CacheService', async () => {
    const uninjected = new UninjectedRepo();
    await expect(uninjected.findById('a')).rejects.toThrow(
      /requires the host class to inject CacheService/,
    );
  });

  it('@InvalidateCache throws a clear error when the host class does not inject CacheService', async () => {
    const uninjected = new UninjectedRepo();
    await expect(uninjected.update()).rejects.toThrow(
      /requires the host class to inject CacheService/,
    );
  });
});
