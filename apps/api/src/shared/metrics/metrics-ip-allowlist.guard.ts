import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { env } from 'src/config/env.config';

@Injectable()
export class MetricsIpAllowlistGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const allowed = env.METRICS_ALLOWED_IPS;
    if (!allowed || allowed.length === 0) {
      throw new ForbiddenException('Metrics endpoint is disabled (METRICS_ALLOWED_IPS not set)');
    }

    const req = ctx.switchToHttp().getRequest<Request>();
    const ip = req.ip ?? '';
    if (!allowed.includes(ip)) {
      throw new ForbiddenException('Metrics endpoint not accessible from this IP');
    }
    return true;
  }
}
