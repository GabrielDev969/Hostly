import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

const extractRoute = (req: Request): string => {
  const route = (req as unknown as { route?: { path?: string } }).route;
  if (route && typeof route.path === 'string') return route.path;
  return 'unknown';
};

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();

    const start = process.hrtime.bigint();
    const http = ctx.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const finalize = () => {
      const durationSec = Number(process.hrtime.bigint() - start) / 1_000_000_000;
      this.metrics.observeHttpRequest(
        {
          method: req.method,
          route: extractRoute(req),
          status_code: String(res.statusCode),
        },
        durationSec,
      );
    };

    return next.handle().pipe(tap({ next: finalize, error: finalize }));
  }
}
