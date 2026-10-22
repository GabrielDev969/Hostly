import { Global, Module } from '@nestjs/common';
import { ScopedPrismaService } from '@shared/tenancy/scoped-prisma.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, ScopedPrismaService],
  exports: [PrismaService, ScopedPrismaService],
})
export class PrismaModule {}
