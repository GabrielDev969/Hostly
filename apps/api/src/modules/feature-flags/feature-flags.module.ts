import { Global, Module } from '@nestjs/common';
import { WorkspacesModule } from '@modules/workspaces/workspaces.module';
import { FeatureFlagsService } from './services/feature-flags.service';
import { FeatureFlagsRepository } from './repositories/feature-flags.repository.interface';
import { PrismaFeatureFlagsRepository } from './repositories/prisma-feature-flags.repository';
import { FeatureGuard } from './guards/feature.guard';
import { AdminFeatureFlagsController } from './http/admin-feature-flags.controller';
import { WorkspaceFeatureFlagsController } from './http/workspace-feature-flags.controller';

@Global()
@Module({
  imports: [WorkspacesModule],
  controllers: [AdminFeatureFlagsController, WorkspaceFeatureFlagsController],
  providers: [
    FeatureFlagsService,
    FeatureGuard,
    {
      provide: FeatureFlagsRepository,
      useClass: PrismaFeatureFlagsRepository,
    },
  ],
  exports: [FeatureFlagsService, FeatureGuard],
})
export class FeatureFlagsModule {}
