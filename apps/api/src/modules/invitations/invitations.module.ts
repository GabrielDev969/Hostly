import { Module } from '@nestjs/common';
import { UsersModule } from '@modules/users/users.module';
import { WorkspacesModule } from '@modules/workspaces/workspaces.module';
import { RbacModule } from '@modules/rbac/rbac.module';
import { InvitationsRepository } from './repositories/invitations.repository.interface';
import { PrismaInvitationsRepository } from './repositories/prisma-invitations.repository';
import { InvitationsController } from './http/invitations.controller';
import { SendInvitationUseCase } from './use-cases/send-invitation.use-case';
import { ListInvitationsUseCase } from './use-cases/list-invitations.use-case';
import { AcceptInvitationUseCase } from './use-cases/accept-invitation.use-case';
import { RevokeInvitationUseCase } from './use-cases/revoke-invitation.use-case';

@Module({
  imports: [UsersModule, WorkspacesModule, RbacModule],
  controllers: [InvitationsController],
  providers: [
    { provide: InvitationsRepository, useClass: PrismaInvitationsRepository },
    SendInvitationUseCase,
    ListInvitationsUseCase,
    AcceptInvitationUseCase,
    RevokeInvitationUseCase,
  ],
})
export class InvitationsModule {}
