import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { WorkspacesRepository } from '@modules/workspaces/repositories/workspaces.repository.interface';
import { WorkspaceMembersRepository } from '@modules/workspaces/repositories/workspace-members.repository.interface';
import { MeResponseDto } from '../http/dto/me-response.dto';
import { ADMIN_WORKSPACE_SLUG } from '@modules/rbac/constants/system';

@Injectable()
export class GetMeUseCase {
  constructor(
    private users: UsersRepository,
    private workspaces: WorkspacesRepository,
    private members: WorkspaceMembersRepository,
  ) {}

  async execute(userId: string): Promise<MeResponseDto> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const [workspaces, superAdminMembership] = await Promise.all([
      this.workspaces.findByUserId(userId),
      this.members.findSuperAdminMembership(userId),
    ]);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      twoFactorEnabled: user.twoFactorEnabled,
      isSuperAdmin: !!superAdminMembership,
      workspaces: workspaces
        .filter((w) => w.slug !== ADMIN_WORKSPACE_SLUG)
        .map((w) => ({
          id: w.id,
          name: w.name,
          slug: w.slug,
          isPersonal: w.isPersonal,
        })),
    };
  }
}
