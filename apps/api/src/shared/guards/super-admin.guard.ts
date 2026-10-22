import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { WorkspaceMembersRepository } from '@modules/workspaces/repositories/workspace-members.repository.interface';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly members: WorkspaceMembersRepository) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();

    const membership = await this.members.findSuperAdminMembership(userId);
    if (!membership) {
      throw new ForbiddenException('Super admin access required');
    }
    return true;
  }
}
