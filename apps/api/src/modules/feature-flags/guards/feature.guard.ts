import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { REQUIRE_FEATURE_KEY } from '../decorators/require-feature.decorator';
import { FeatureFlagsService } from '../services/feature-flags.service';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private features: FeatureFlagsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | undefined>(REQUIRE_FEATURE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;

    const req = ctx.switchToHttp().getRequest<Request & { workspace?: { id: string } }>();
    const workspaceId = req.workspace?.id;
    if (!workspaceId) {
      throw new ForbiddenException('Feature-gated route requires a workspace context');
    }

    const enabled = await this.features.isEnabled(workspaceId, required);
    if (!enabled) {
      throw new ForbiddenException(`Feature "${required}" is not enabled for this workspace`);
    }
    return true;
  }
}
