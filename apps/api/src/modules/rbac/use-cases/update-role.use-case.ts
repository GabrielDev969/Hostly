import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RolesRepository } from '../repositories/roles.repository.interface';
import { UnknownPermissionsError } from '../errors/unknown-permissions.error';
import { RoleResponseDto, toRoleDto } from '../http/dto/role-response.dto';
import { assertCanManageRoles, assertRoleFitsScope } from '../constants/roles';
import { TenantContext } from '@shared/tenancy/tenant-context';

interface UpdateRoleInput {
  id: string;
  workspaceId: string;
  name?: string;
  description?: string;
  permissionKeys?: string[];
}

@Injectable()
export class UpdateRoleUseCase {
  constructor(private roles: RolesRepository) {}

  async execute(input: UpdateRoleInput): Promise<RoleResponseDto> {
    assertCanManageRoles(TenantContext.scope);
    const role = await this.roles.findByIdInWorkspace(input.id, input.workspaceId);
    if (!role) throw new NotFoundException('Role not found in this workspace');
    if (role.isSystem) throw new ForbiddenException('System roles cannot be modified');

    if (input.permissionKeys) {
      await this.assertMembershipsStillFit(input.id, input.name ?? role.name, input.permissionKeys);
    }

    if (input.name && input.name !== role.name) {
      const conflict = await this.roles.findByNameInWorkspace(input.name, input.workspaceId);
      if (conflict) throw new ConflictException(`Role "${input.name}" already exists`);
    }

    try {
      const updated = await this.roles.update(input.id, {
        name: input.name,
        description: input.description,
        permissionKeys: input.permissionKeys,
      });
      return toRoleDto(updated);
    } catch (err) {
      if (err instanceof UnknownPermissionsError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  // A role already held by client or advertiser memberships cannot grow past their ceiling.
  private async assertMembershipsStillFit(
    roleId: string,
    name: string,
    permissionKeys: string[],
  ): Promise<void> {
    const permissions = permissionKeys.map((key) => ({ key }));
    for (const membership of await this.roles.findMembershipScopesUsingRole(roleId)) {
      assertRoleFitsScope({ name, permissions }, membership);
    }
  }
}
