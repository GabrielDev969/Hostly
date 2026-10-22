import { Injectable } from '@nestjs/common';
import { RolesRepository } from '../repositories/roles.repository.interface';
import { RoleResponseDto, toRoleDto } from '../http/dto/role-response.dto';

@Injectable()
export class ListRolesUseCase {
  constructor(private roles: RolesRepository) {}

  async execute(workspaceId: string): Promise<RoleResponseDto[]> {
    const roles = await this.roles.findManyByWorkspace(workspaceId);
    return roles.map(toRoleDto);
  }
}
