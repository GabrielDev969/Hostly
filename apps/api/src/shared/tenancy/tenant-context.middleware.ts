import { Injectable, NestMiddleware } from '@nestjs/common';

import { TenantContext } from './tenant-context';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(_req: unknown, _res: unknown, next: () => void): void {
    TenantContext.run(next);
  }
}
