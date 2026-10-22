import { Injectable, NotFoundException } from '@nestjs/common';
import { PermissionsRepository } from '../repositories/permissions.repository.interface';

interface DeletePermissionInput {
  id: string;
  workspaceId: string;
}

@Injectable()
export class DeletePermissionUseCase {
  constructor(private permissions: PermissionsRepository) {}

  async execute(input: DeletePermissionInput): Promise<void> {
    const existing = await this.permissions.findByIdInWorkspace(input.id, input.workspaceId);
    if (!existing) {
      throw new NotFoundException('Permission not found in this workspace');
    }
    await this.permissions.delete(input.id);
  }
}
