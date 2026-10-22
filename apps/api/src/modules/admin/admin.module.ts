import { Module } from '@nestjs/common';
import { UsersModule } from '@modules/users/users.module';
import { SessionsModule } from '@modules/sessions/sessions.module';
import { WorkspacesModule } from '@modules/workspaces/workspaces.module';
import { SuperAdminGuard } from '@shared/guards/super-admin.guard';
import { AdminUsersController } from './http/admin-users.controller';
import { InvalidateUserTokensUseCase } from './use-cases/invalidate-user-tokens.use-case';

@Module({
  imports: [UsersModule, SessionsModule, WorkspacesModule],
  controllers: [AdminUsersController],
  providers: [InvalidateUserTokensUseCase, SuperAdminGuard],
})
export class AdminModule {}
