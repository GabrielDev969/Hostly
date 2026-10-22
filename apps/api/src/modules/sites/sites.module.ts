import { Module } from '@nestjs/common';
import { WorkspacesModule } from '@modules/workspaces/workspaces.module';
import { ClientsModule } from '@modules/clients/clients.module';
import { SitesRepository } from './repositories/sites.repository.interface';
import { PrismaSitesRepository } from './repositories/prisma-sites.repository';
import { SitesController } from './http/sites.controller';
import { ListSitesUseCase } from './use-cases/list-sites.use-case';
import { GetSiteUseCase } from './use-cases/get-site.use-case';
import { CreateSiteUseCase } from './use-cases/create-site.use-case';
import { UpdateSiteUseCase } from './use-cases/update-site.use-case';
import { DeleteSiteUseCase } from './use-cases/delete-site.use-case';

@Module({
  imports: [WorkspacesModule, ClientsModule],
  controllers: [SitesController],
  providers: [
    { provide: SitesRepository, useClass: PrismaSitesRepository },
    ListSitesUseCase,
    GetSiteUseCase,
    CreateSiteUseCase,
    UpdateSiteUseCase,
    DeleteSiteUseCase,
  ],
})
export class SitesModule {}
