import { Module } from '@nestjs/common';
import { WorkspacesModule } from '@modules/workspaces/workspaces.module';
import { ClientsRepository } from './repositories/clients.repository.interface';
import { PrismaClientsRepository } from './repositories/prisma-clients.repository';
import { ClientsController } from './http/clients.controller';
import { ListClientsUseCase } from './use-cases/list-clients.use-case';
import { GetClientUseCase } from './use-cases/get-client.use-case';
import { CreateClientUseCase } from './use-cases/create-client.use-case';
import { UpdateClientUseCase } from './use-cases/update-client.use-case';
import { DeleteClientUseCase } from './use-cases/delete-client.use-case';

@Module({
  imports: [WorkspacesModule],
  controllers: [ClientsController],
  providers: [
    { provide: ClientsRepository, useClass: PrismaClientsRepository },
    ListClientsUseCase,
    GetClientUseCase,
    CreateClientUseCase,
    UpdateClientUseCase,
    DeleteClientUseCase,
  ],
  exports: [ClientsRepository],
})
export class ClientsModule {}
