import { forwardRef, Module } from '@nestjs/common';
import { RolesRepository } from './repositories/roles.repository.interface';
import { PermissionsRepository } from './repositories/permissions.repository.interface';
import { PrismaRolesRepository } from './repositories/prisma-roles.repository';
import { PrismaPermissionsRepository } from './repositories/prisma-permissions.repository';
import { RbacController } from './http/rbac.controller';
import { PermissionsController } from './http/permissions.controller';
import { CreateRoleUseCase } from './use-cases/create-role.use-case';
import { ListRolesUseCase } from './use-cases/list-roles.use-case';
import { UpdateRoleUseCase } from './use-cases/update-role.use-case';
import { DeleteRoleUseCase } from './use-cases/delete-role.use-case';
import { AssignPermissionToRoleUseCase } from './use-cases/assign-permission-to-role.use-case';
import { CreatePermissionUseCase } from './use-cases/create-permission.use-case';
import { DeletePermissionUseCase } from './use-cases/delete-permission.use-case';
import { ListWorkspacePermissionsUseCase } from './use-cases/list-workspace-permissions.use-case';
import { WorkspacesModule } from '@modules/workspaces/workspaces.module';

@Module({
  imports: [forwardRef(() => WorkspacesModule)],
  controllers: [RbacController, PermissionsController],
  providers: [
    { provide: RolesRepository, useClass: PrismaRolesRepository },
    { provide: PermissionsRepository, useClass: PrismaPermissionsRepository },
    CreateRoleUseCase,
    ListRolesUseCase,
    UpdateRoleUseCase,
    DeleteRoleUseCase,
    AssignPermissionToRoleUseCase,
    CreatePermissionUseCase,
    DeletePermissionUseCase,
    ListWorkspacePermissionsUseCase,
  ],
  exports: [RolesRepository, PermissionsRepository],
})
export class RbacModule {}
