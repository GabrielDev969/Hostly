import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PermissionsRepository } from '../repositories/permissions.repository.interface';
import { ALL_PERMISSION_KEYS } from '../constants/permissions';
import { Permission } from '../entities/permission.entity';

interface CreatePermissionInput {
  workspaceId: string;
  key: string;
  description?: string | null;
  category?: string;
}

const CUSTOM_KEY_PATTERN = /^custom:[a-z0-9]+(?:[._:-][a-z0-9]+)+$/;

@Injectable()
export class CreatePermissionUseCase {
  constructor(private permissions: PermissionsRepository) {}

  async execute(input: CreatePermissionInput): Promise<Permission> {
    if (!CUSTOM_KEY_PATTERN.test(input.key)) {
      throw new BadRequestException('Permission key must match ^custom:<segment>(:<segment>)+$');
    }
    if (ALL_PERMISSION_KEYS.includes(input.key)) {
      throw new ConflictException(
        `Permission key "${input.key}" collides with a built-in permission`,
      );
    }

    const existing = await this.permissions.findByKeyInScope(input.key, input.workspaceId);
    if (existing) {
      throw new ConflictException(`Permission "${input.key}" already exists in this workspace`);
    }

    return this.permissions.create({
      workspaceId: input.workspaceId,
      key: input.key,
      description: input.description ?? null,
      category: input.category ?? 'custom',
    });
  }
}
