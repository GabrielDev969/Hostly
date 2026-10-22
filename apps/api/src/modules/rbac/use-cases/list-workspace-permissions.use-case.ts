import { Injectable } from '@nestjs/common';
import { PermissionsRepository } from '../repositories/permissions.repository.interface';
import { Permission } from '../entities/permission.entity';

@Injectable()
export class ListWorkspacePermissionsUseCase {
  constructor(private permissions: PermissionsRepository) {}

  execute(workspaceId: string): Promise<Permission[]> {
    return this.permissions.findAllForWorkspace(workspaceId);
  }
}
