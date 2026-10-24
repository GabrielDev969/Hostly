import { Injectable } from '@nestjs/common';
import {
  WorkspacesRepository,
  CreateWorkspaceWithDefaultsData,
  CreateWorkspaceResult,
} from './workspaces.repository.interface';
import type { TransferOwnershipData } from './workspaces.repository.interface';
import { Workspace } from '../entities/workspace.entity';
import { PrismaService } from '@shared/database/prisma.service';
import { Workspace as WorkspacePrisma } from '@prisma/client';
import { InvalidateCache } from '@shared/cache/invalidate-cache.decorator';
import { CACHE_NS } from '@shared/cache/cache.constants';
import { CacheService } from '@shared/cache/cache.service';

@Injectable()
export class PrismaWorkspacesRepository extends WorkspacesRepository {
  constructor(
    private prisma: PrismaService,
    protected readonly cacheService: CacheService,
  ) {
    super();
  }

  async createWithDefaults(data: CreateWorkspaceWithDefaultsData): Promise<CreateWorkspaceResult> {
    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: data.name,
          slug: `org-${data.slug}`,
          ownerId: data.ownerId,
        },
      });
      const workspace = await tx.workspace.create({
        data: {
          name: data.name,
          slug: data.slug,
          isPersonal: data.isPersonal,
          ownerId: data.ownerId,
          organizationId: organization.id,
        },
      });
      await tx.client.create({
        data: {
          organizationId: organization.id,
          name: data.internalClientName,
          status: 'active',
          isInternal: true,
        },
      });

      const allKeys = [...new Set(data.defaultRoles.flatMap((r) => r.permissionKeys))];
      const perms = await tx.permission.findMany({
        where: { key: { in: allKeys } },
      });
      const permMap = new Map(perms.map((p) => [p.key, p.id]));

      let ownerRoleId = '';

      for (const role of data.defaultRoles) {
        const created = await tx.role.create({
          data: {
            name: role.name,
            description: role.description,
            workspaceId: workspace.id,
            isSystem: role.isSystem,
            permissions: {
              create: role.permissionKeys
                .map((key) => permMap.get(key))
                .filter((id): id is string => Boolean(id))
                .map((permissionId) => ({ permissionId })),
            },
          },
        });

        if (role.name === data.ownerRoleName) {
          ownerRoleId = created.id;
        }
      }

      if (!ownerRoleId) {
        throw new Error(`Owner role "${data.ownerRoleName}" not found in defaultRoles`);
      }

      await tx.workspaceMember.create({
        data: {
          userId: data.ownerId,
          workspaceId: workspace.id,
          organizationId: organization.id,
          roleId: ownerRoleId,
        },
      });

      return {
        workspace: this.toEntity(workspace),
        ownerRoleId,
      };
    });
  }

  async findById(id: string): Promise<Workspace | null> {
    const workspace = await this.prisma.workspace.findFirst({
      where: { id, deletedAt: null },
    });
    return workspace ? this.toEntity(workspace) : null;
  }

  async findBySlug(slug: string): Promise<Workspace | null> {
    const workspace = await this.prisma.workspace.findFirst({
      where: { slug, deletedAt: null },
    });
    return workspace ? this.toEntity(workspace) : null;
  }

  // An operator is one organization with one workspace; the oldest wins should a second ever exist.
  async findOperatorWorkspaceId(organizationId: string): Promise<string | null> {
    const workspace = await this.prisma.workspace.findFirst({
      where: { organizationId, isPersonal: false, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return workspace?.id ?? null;
  }

  async findByUserId(userId: string): Promise<Workspace[]> {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId, workspace: { deletedAt: null } },
      include: { workspace: true },
    });
    return memberships.map((m) => this.toEntity(m.workspace));
  }

  async update(id: string, data: Partial<Workspace>): Promise<Workspace> {
    const workspace = await this.prisma.workspace.update({
      where: { id },
      data: {
        name: data.name,
        slug: data.slug,
      },
    });
    return this.toEntity(workspace);
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.workspace.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  @InvalidateCache(CACHE_NS.workspaceMembers)
  async transferOwnership(data: TransferOwnershipData): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.workspaceMember.update({
        where: {
          userId_workspaceId: {
            userId: data.fromUserId,
            workspaceId: data.workspaceId,
          },
        },
        data: { roleId: data.adminRoleId },
      }),
      this.prisma.workspaceMember.update({
        where: {
          userId_workspaceId: {
            userId: data.toUserId,
            workspaceId: data.workspaceId,
          },
        },
        data: { roleId: data.ownerRoleId },
      }),
      this.prisma.workspace.update({
        where: { id: data.workspaceId },
        data: { ownerId: data.toUserId },
      }),
    ]);
  }

  private toEntity(raw: WorkspacePrisma): Workspace {
    return {
      id: raw.id,
      name: raw.name,
      slug: raw.slug,
      isPersonal: raw.isPersonal,
      ownerId: raw.ownerId,
      organizationId: raw.organizationId,
      deletedAt: raw.deletedAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }
}
