import { Injectable } from '@nestjs/common';
import { WorkspaceFeatureFlag as PrismaRow } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { WorkspaceFeatureFlag } from '../entities/workspace-feature-flag.entity';
import { FeatureFlagsRepository } from './feature-flags.repository.interface';

@Injectable()
export class PrismaFeatureFlagsRepository extends FeatureFlagsRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async findByWorkspace(workspaceId: string): Promise<WorkspaceFeatureFlag[]> {
    const rows = await this.prisma.workspaceFeatureFlag.findMany({
      where: { workspaceId },
    });
    return rows.map(toEntity);
  }

  async findOne(workspaceId: string, key: string): Promise<WorkspaceFeatureFlag | null> {
    const row = await this.prisma.workspaceFeatureFlag.findUnique({
      where: { workspaceId_key: { workspaceId, key } },
    });
    return row ? toEntity(row) : null;
  }

  async upsert(workspaceId: string, key: string, enabled: boolean): Promise<WorkspaceFeatureFlag> {
    const row = await this.prisma.workspaceFeatureFlag.upsert({
      where: { workspaceId_key: { workspaceId, key } },
      update: { enabled },
      create: { workspaceId, key, enabled },
    });
    return toEntity(row);
  }

  async delete(workspaceId: string, key: string): Promise<void> {
    await this.prisma.workspaceFeatureFlag.deleteMany({
      where: { workspaceId, key },
    });
  }
}

function toEntity(raw: PrismaRow): WorkspaceFeatureFlag {
  return {
    id: raw.id,
    workspaceId: raw.workspaceId,
    key: raw.key,
    enabled: raw.enabled,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}
