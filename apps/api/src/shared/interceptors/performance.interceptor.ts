import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { env } from 'src/config/env.config';

@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Performance');
  private readonly thresholdMs = env.LOG_SLOW_REQUEST_MS;

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();

    const start = process.hrtime.bigint();
    const req = ctx.switchToHttp().getRequest<Request & { id?: string }>();
    const handler = `${ctx.getClass().name}.${ctx.getHandler().name}`;

    const finalize = () => {
      const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      if (elapsedMs >= this.thresholdMs) {
        this.logger.warn({
          msg: 'Slow request',
          handler,
          method: req.method,
          url: req.originalUrl ?? req.url,
          requestId: req.id,
          durationMs: Math.round(elapsedMs),
          thresholdMs: this.thresholdMs,
        });
      }
    };

    return next.handle().pipe(tap({ next: finalize, error: finalize }));
  }
}
