import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

type AuthenticatedRequest = {
  user?: { id?: string };
  ip?: string;
};

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const { user, ip } = req as AuthenticatedRequest;
    const userId = user?.id;
    if (userId) return Promise.resolve(`user:${userId}`);
    return Promise.resolve(`ip:${ip ?? 'unknown'}`);
  }
}
