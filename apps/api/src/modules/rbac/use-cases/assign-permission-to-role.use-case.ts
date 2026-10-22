import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RolesRepository } from '../repositories/roles.repository.interface';
import { PermissionsRepository } from '../repositories/permissions.repository.interface';
import { UnknownPermissionsError } from '../errors/unknown-permissions.error';
import { RoleResponseDto, toRoleDto } from '../http/dto/role-response.dto';

interface AssignPermissionInput {
  roleId: string;
  workspaceId: string;
  permissionKey: string;
}

@Injectable()
export class AssignPermissionToRoleUseCase {
  constructor(
    private roles: RolesRepository,
    private permissions: PermissionsRepository,
  ) {}

  async execute(input: AssignPermissionInput): Promise<RoleResponseDto> {
    const role = await this.roles.findByIdInWorkspace(input.roleId, input.workspaceId);
    if (!role) throw new NotFoundException('Role not found in this workspace');
    if (role.isSystem) throw new ForbiddenException('System roles cannot be modified');

    const permission = await this.permissions.findByKeyInScope(
      input.permissionKey,
      input.workspaceId,
    );
    if (!permission)
      throw new NotFoundException(`Permission "${input.permissionKey}" does not exist`);

    if (role.permissions.some((p) => p.key === input.permissionKey)) {
      return toRoleDto(role);
    }

    try {
      const updated = await this.roles.update(input.roleId, {
        permissionKeys: [...role.permissions.map((p) => p.key), input.permissionKey],
      });
      return toRoleDto(updated);
    } catch (err) {
      if (err instanceof UnknownPermissionsError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
