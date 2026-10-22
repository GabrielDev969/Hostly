import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { createHash } from 'crypto';
import { firstValueFrom, from, Observable } from 'rxjs';
import {
  DEFAULT_IDEMPOTENCY_LOCK_TTL_MS,
  DEFAULT_IDEMPOTENCY_TTL_MS,
  IDEMPOTENCY_KEY_PATTERN,
  IDEMPOTENT_KEY,
} from './constants';
import { IdempotentMetadata } from './idempotent.decorator';
import { IdempotencyService } from './idempotency.service';

type IdempotencyRequest = Request & {
  user?: { id: string };
};

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly service: IdempotencyService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<IdempotentMetadata>(IDEMPOTENT_KEY, ctx.getHandler());
    if (!meta) return next.handle();

    const req = ctx.switchToHttp().getRequest<IdempotencyRequest>();
    const headerKey = req.headers['idempotency-key'];

    if (headerKey === undefined) return next.handle();

    if (typeof headerKey !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(headerKey)) {
      throw new BadRequestException('Idempotency-Key must match ^[A-Za-z0-9._-]{1,255}$');
    }

    const userId = req.user?.id;
    if (!userId) return next.handle();

    const res = ctx.switchToHttp().getResponse<Response>();
    const routePath = (req.route as { path?: string } | undefined)?.path ?? req.path;
    const scopedKey = `idem:user-${userId}:${req.method}:${routePath}:${headerKey}`;
    const bodyHash = createHash('sha256')
      .update(JSON.stringify(req.body ?? null))
      .digest('hex');
    const ttlMs = meta.ttlMs ?? DEFAULT_IDEMPOTENCY_TTL_MS;

    return from(this.handle(next, res, scopedKey, bodyHash, ttlMs));
  }

  private async handle(
    next: CallHandler,
    res: Response,
    scopedKey: string,
    bodyHash: string,
    ttlMs: number,
  ): Promise<unknown> {
    const acquired = await this.service.tryAcquireLock(
      scopedKey,
      bodyHash,
      DEFAULT_IDEMPOTENCY_LOCK_TTL_MS,
    );

    if (!acquired) {
      const existing = await this.service.fetch(scopedKey);
      if (!existing) {
        throw new ConflictException('Idempotent request in progress');
      }
      if (existing.bodyHash !== bodyHash) {
        throw new UnprocessableEntityException(
          'Idempotency-Key reused with a different request body',
        );
      }
      if (existing.state === 'locked') {
        throw new ConflictException('Idempotent request in progress');
      }
      res.status(existing.status);
      return existing.body;
    }

    try {
      const body: unknown = await firstValueFrom(next.handle());
      await this.service.storeResponse(scopedKey, bodyHash, res.statusCode, body, ttlMs);
      return body;
    } catch (err) {
      await this.service.release(scopedKey).catch(() => undefined);
      throw err;
    }
  }
}
