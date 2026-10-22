import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { tenantScopeExtension } from './tenant-scope.extension';

const extend = (prisma: PrismaService) => prisma.$extends(tenantScopeExtension);

export type ScopedPrismaClient = ReturnType<typeof extend>;

// Business repositories read and write through this client so rule 5 holds without each query
// remembering organizationId/clientId/advertiserId. Identity lookups keep using PrismaService.
@Injectable()
export class ScopedPrismaService {
  readonly client: ScopedPrismaClient;

  constructor(prisma: PrismaService) {
    this.client = extend(prisma);
  }
}
