import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { RolesRepository } from '../repositories/roles.repository.interface';
import { UnknownPermissionsError } from '../errors/unknown-permissions.error';
import { RoleResponseDto, toRoleDto } from '../http/dto/role-response.dto';
import { assertCanManageRoles } from '../constants/roles';
import { TenantContext } from '@shared/tenancy/tenant-context';

interface CreateRoleInput {
  workspaceId: string;
  name: string;
  description?: string;
  permissionKeys: string[];
}

@Injectable()
export class CreateRoleUseCase {
  constructor(private roles: RolesRepository) {}

  async execute(input: CreateRoleInput): Promise<RoleResponseDto> {
    assertCanManageRoles(TenantContext.scope);
    const existing = await this.roles.findByNameInWorkspace(input.name, input.workspaceId);
    if (existing) throw new ConflictException(`Role "${input.name}" already exists`);

    try {
      const role = await this.roles.create({
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description,
        permissionKeys: input.permissionKeys,
        isSystem: false,
      });
      return toRoleDto(role);
    } catch (err) {
      if (err instanceof UnknownPermissionsError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
