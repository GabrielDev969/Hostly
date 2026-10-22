import { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsService } from './metrics.service';

describe('MetricsInterceptor', () => {
  let metrics: jest.Mocked<Pick<MetricsService, 'observeHttpRequest'>>;
  let interceptor: MetricsInterceptor;

  beforeEach(() => {
    metrics = { observeHttpRequest: jest.fn() };
    interceptor = new MetricsInterceptor(metrics as unknown as MetricsService);
  });

  function buildContext(
    req: Record<string, unknown>,
    res: Record<string, unknown>,
    type: 'http' | 'rpc' = 'http',
  ): ExecutionContext {
    return {
      getType: () => type,
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
        getNext: () => undefined,
      }),
    } as unknown as ExecutionContext;
  }

  it('records http request metrics on success with route from req.route.path', async () => {
    const ctx = buildContext({ method: 'GET', route: { path: '/users/:id' } }, { statusCode: 200 });
    const next: CallHandler = { handle: () => of('payload') };

    const value = await firstValueFrom(interceptor.intercept(ctx, next));

    expect(value).toBe('payload');
    expect(metrics.observeHttpRequest).toHaveBeenCalledTimes(1);
    const [labels, durationSec] = metrics.observeHttpRequest.mock.calls[0]!;
    expect(labels).toEqual({
      method: 'GET',
      route: '/users/:id',
      status_code: '200',
    });
    expect(typeof durationSec).toBe('number');
    expect(durationSec).toBeGreaterThanOrEqual(0);
  });

  it('falls back to "unknown" when req.route.path is missing', async () => {
    const ctx = buildContext({ method: 'POST' }, { statusCode: 201 });
    const next: CallHandler = { handle: () => of(undefined) };

    await firstValueFrom(interceptor.intercept(ctx, next));

    expect(metrics.observeHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        route: 'unknown',
        status_code: '201',
      }),
      expect.any(Number),
    );
  });

  it('also falls back to "unknown" when req.route exists without a string path', async () => {
    const ctx = buildContext({ method: 'GET', route: { path: 123 } }, { statusCode: 200 });
    const next: CallHandler = { handle: () => of('x') };

    await firstValueFrom(interceptor.intercept(ctx, next));

    expect(metrics.observeHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({ route: 'unknown' }),
      expect.any(Number),
    );
  });

  it('also records metrics when the downstream observable errors', async () => {
    const ctx = buildContext(
      { method: 'DELETE', route: { path: '/items/:id' } },
      { statusCode: 500 },
    );
    const next: CallHandler = {
      handle: () => throwError(() => new Error('boom')),
    };

    await expect(
      firstValueFrom(
        interceptor.intercept(ctx, next).pipe(
          catchError((err: Error) => {
            throw err;
          }),
        ),
      ),
    ).rejects.toThrow('boom');

    expect(metrics.observeHttpRequest).toHaveBeenCalledTimes(1);
    expect(metrics.observeHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'DELETE',
        route: '/items/:id',
        status_code: '500',
      }),
      expect.any(Number),
    );
  });

  it('skips metric collection for non-http contexts', async () => {
    const ctx = buildContext({}, {}, 'rpc');
    const next: CallHandler = { handle: () => of('rpc-result') };

    const value = await firstValueFrom(interceptor.intercept(ctx, next));

    expect(value).toBe('rpc-result');
    expect(metrics.observeHttpRequest).not.toHaveBeenCalled();
  });
});
