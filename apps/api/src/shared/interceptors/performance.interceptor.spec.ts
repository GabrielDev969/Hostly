import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { PerformanceInterceptor } from './performance.interceptor';

describe('PerformanceInterceptor', () => {
  const interceptor = new PerformanceInterceptor();
  let warnSpy: jest.SpyInstance;
  let hrSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function buildContext(): ExecutionContext {
    return {
      getType: () => 'http',
      getClass: () => ({ name: 'UsersController' }),
      getHandler: () => ({ name: 'list' }),
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          url: '/api/v1/users',
          originalUrl: '/api/v1/users',
          id: 'req-1',
        }),
        getResponse: () => ({}),
        getNext: () => undefined,
      }),
    } as unknown as ExecutionContext;
  }

  function stubElapsed(elapsedMs: number) {
    const start = 0n;
    const end = BigInt(elapsedMs * 1_000_000);
    hrSpy = jest
      .spyOn(process.hrtime, 'bigint')
      .mockReturnValueOnce(start)
      .mockReturnValueOnce(end);
  }

  it('emits no warning when the request finishes under the threshold', async () => {
    stubElapsed(10);
    const ctx = buildContext();
    const next: CallHandler = { handle: () => of('ok') };

    await firstValueFrom(interceptor.intercept(ctx, next));

    expect(warnSpy).not.toHaveBeenCalled();
    expect(hrSpy).toHaveBeenCalledTimes(2);
  });

  it('skips slow-request logic for non-http contexts', async () => {
    const ctx = {
      getType: () => 'rpc',
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of('ok') };

    await firstValueFrom(interceptor.intercept(ctx, next));

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('falls back to req.url when originalUrl is missing on the slow path', async () => {
    stubElapsed(2500);
    const ctx = {
      getType: () => 'http',
      getClass: () => ({ name: 'UsersController' }),
      getHandler: () => ({ name: 'list' }),
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          url: '/api/v1/fallback',
          id: 'req-x',
        }),
        getResponse: () => ({}),
        getNext: () => undefined,
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of('ok') };

    await firstValueFrom(interceptor.intercept(ctx, next));

    expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/v1/fallback' }));
  });

  it('logs a warning with handler, durationMs and threshold when the request is slow', async () => {
    stubElapsed(2500);
    const ctx = buildContext();
    const next: CallHandler = { handle: () => of('ok') };

    await firstValueFrom(interceptor.intercept(ctx, next));

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'Slow request',
        handler: 'UsersController.list',
        method: 'GET',
        url: '/api/v1/users',
        requestId: 'req-1',
        durationMs: 2500,
        thresholdMs: expect.any(Number),
      }),
    );
  });
});
