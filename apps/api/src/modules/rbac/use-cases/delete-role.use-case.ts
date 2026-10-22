import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { RolesRepository } from '../repositories/roles.repository.interface';

interface DeleteRoleInput {
  id: string;
  workspaceId: string;
}

@Injectable()
export class DeleteRoleUseCase {
  constructor(private roles: RolesRepository) {}

  async execute(input: DeleteRoleInput): Promise<void> {
    const role = await this.roles.findByIdInWorkspace(input.id, input.workspaceId);
    if (!role) throw new NotFoundException('Role not found in this workspace');
    if (role.isSystem) throw new ForbiddenException('System roles cannot be deleted');

    const inUse = await this.roles.countMembersUsingRole(input.id);
    if (inUse > 0)
      throw new ConflictException(
        `Role is assigned to ${inUse} member(s); reassign them before deleting`,
      );

    await this.roles.delete(input.id);
  }
}
