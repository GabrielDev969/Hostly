import { forwardRef, Module } from '@nestjs/common';
import { WorkspacesRepository } from './repositories/workspaces.repository.interface';
import { PrismaWorkspacesRepository } from './repositories/prisma-workspaces.repository';
import { WorkspaceMembersRepository } from './repositories/workspace-members.repository.interface';
import { PrismaWorkspaceMembersRepository } from './repositories/prisma-workspace-members.repository';
import { WorkspacesController } from './http/workspaces.controller';
import { CreateWorkspaceUseCase } from './use-cases/create-workspace.use-case';
import { GetWorkspaceUseCase } from './use-cases/get-workspace.use-case';
import { ListWorkspacesUseCase } from './use-cases/list-workspaces.use-case';
import { UpdateWorkspaceUseCase } from './use-cases/update-workspace.use-case';
import { DeleteWorkspaceUseCase } from './use-cases/delete-workspace.use-case';
import { ListMembersUseCase } from './use-cases/list-members.use-case';
import { UpdateMemberRoleUseCase } from './use-cases/update-member-role.use-case';
import { RemoveMemberUseCase } from './use-cases/remove-member.use-case';
import { TransferOwnershipUseCase } from './use-cases/transfer-ownership.use-case';
import { RbacModule } from '@modules/rbac/rbac.module';
import { UsersModule } from '@modules/users/users.module';

@Module({
  imports: [forwardRef(() => RbacModule), forwardRef(() => UsersModule)],
  controllers: [WorkspacesController],
  providers: [
    { provide: WorkspacesRepository, useClass: PrismaWorkspacesRepository },
    {
      provide: WorkspaceMembersRepository,
      useClass: PrismaWorkspaceMembersRepository,
    },
    CreateWorkspaceUseCase,
    GetWorkspaceUseCase,
    ListWorkspacesUseCase,
    UpdateWorkspaceUseCase,
    DeleteWorkspaceUseCase,
    ListMembersUseCase,
    UpdateMemberRoleUseCase,
    RemoveMemberUseCase,
    TransferOwnershipUseCase,
  ],
  exports: [WorkspacesRepository, WorkspaceMembersRepository, CreateWorkspaceUseCase],
})
export class WorkspacesModule {}
