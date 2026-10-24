import { Injectable } from '@nestjs/common';
import { RolesRepository } from './roles.repository.interface';
import { UnknownPermissionsError } from '../errors/unknown-permissions.error';
import type {
  CreateRoleData,
  MembershipScope,
  UpdateRoleData,
  RoleWithPermissions,
} from './roles.repository.interface';
import { Role } from '../entities/role.entity';
import { Permission } from '../entities/permission.entity';
import { PrismaService } from '@shared/database/prisma.service';
import { Role as PrismaRole, Permission as PrismaPermission, Prisma } from '@prisma/client';
import { Cacheable } from '@shared/cache/cacheable.decorator';
import { InvalidateCache } from '@shared/cache/invalidate-cache.decorator';
import { CACHE_NS, CACHE_TTL } from '@shared/cache/cache.constants';
import { CacheService } from '@shared/cache/cache.service';
import { ScopedPrismaService } from '@shared/tenancy/scoped-prisma.service';

type PrismaRoleWithRelations = Prisma.RoleGetPayload<{
  include: { permissions: { include: { permission: true } } };
}>;

@Injectable()
export class PrismaRolesRepository extends RolesRepository {
  constructor(
    private prisma: PrismaService,
    private scoped: ScopedPrismaService,
    protected readonly cacheService: CacheService,
  ) {
    super();
  }

  @InvalidateCache(CACHE_NS.roles)
  async create(data: CreateRoleData): Promise<RoleWithPermissions> {
    return this.scoped.client.$transaction(async (tx) => {
      const perms = await tx.permission.findMany({
        where: {
          key: { in: data.permissionKeys },
          OR: [{ workspaceId: null }, { workspaceId: data.workspaceId }],
        },
      });

      if (perms.length !== data.permissionKeys.length) {
        const missing = data.permissionKeys.filter((k) => !perms.some((p) => p.key === k));
        throw new UnknownPermissionsError(missing);
      }

      // The scoped client refuses nested writes, so the links go through their own delegate.
      const { id } = await tx.role.create({
        data: {
          name: data.name,
          description: data.description,
          workspaceId: data.workspaceId,
          isSystem: data.isSystem ?? false,
        },
      });
      await tx.rolePermission.createMany({
        data: perms.map((p) => ({ roleId: id, permissionId: p.id })),
      });

      const role = await tx.role.findUniqueOrThrow({
        where: { id },
        include: { permissions: { include: { permission: true } } },
      });
      return this.toRoleWithPermissions(role);
    });
  }

  async findById(id: string): Promise<RoleWithPermissions | null> {
    const role = await this.scoped.client.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } },
    });
    return role ? this.toRoleWithPermissions(role) : null;
  }

  async findByIdInWorkspace(id: string, workspaceId: string): Promise<RoleWithPermissions | null> {
    const role = await this.scoped.client.role.findFirst({
      where: { id, workspaceId },
      include: { permissions: { include: { permission: true } } },
    });
    return role ? this.toRoleWithPermissions(role) : null;
  }

  @Cacheable({
    namespace: CACHE_NS.roles,
    key: (workspaceId: string) => `workspace:${workspaceId}`,
    ttlMs: CACHE_TTL.oneHour,
  })
  async findManyByWorkspace(workspaceId: string): Promise<RoleWithPermissions[]> {
    const roles = await this.scoped.client.role.findMany({
      where: { workspaceId },
      include: { permissions: { include: { permission: true } } },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return roles.map((r) => this.toRoleWithPermissions(r));
  }

  async findByNameInWorkspace(name: string, workspaceId: string): Promise<Role | null> {
    const role = await this.scoped.client.role.findUnique({
      where: { workspaceId_name: { workspaceId, name } },
    });
    return role ? this.toRole(role) : null;
  }

  @InvalidateCache(CACHE_NS.roles, CACHE_NS.workspaceMembers)
  async update(id: string, data: UpdateRoleData): Promise<RoleWithPermissions> {
    return this.scoped.client.$transaction(async (tx) => {
      // Update fields
      if (data.name || data.description !== undefined) {
        await tx.role.update({
          where: { id },
          data: {
            ...(data.name && { name: data.name }),
            ...(data.description !== undefined && {
              description: data.description,
            }),
          },
        });
      }

      // Replace permissions atomically if provided
      if (data.permissionKeys) {
        const target = await tx.role.findUniqueOrThrow({
          where: { id },
          select: { workspaceId: true },
        });
        const perms = await tx.permission.findMany({
          where: {
            key: { in: data.permissionKeys },
            OR: [{ workspaceId: null }, { workspaceId: target.workspaceId }],
          },
        });

        if (perms.length !== data.permissionKeys.length) {
          const missing = data.permissionKeys.filter((k) => !perms.some((p) => p.key === k));
          throw new UnknownPermissionsError(missing);
        }

        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({
          data: perms.map((p) => ({ roleId: id, permissionId: p.id })),
        });
      }

      const updated = await tx.role.findUniqueOrThrow({
        where: { id },
        include: { permissions: { include: { permission: true } } },
      });

      return this.toRoleWithPermissions(updated);
    });
  }

  @InvalidateCache(CACHE_NS.roles, CACHE_NS.workspaceMembers)
  async delete(id: string, workspaceId: string): Promise<void> {
    await this.prisma.role.delete({ where: { id, workspaceId } });
  }

  async countMembersUsingRole(roleId: string): Promise<number> {
    return this.prisma.workspaceMember.count({ where: { roleId } });
  }

  async findMembershipScopesUsingRole(roleId: string): Promise<MembershipScope[]> {
    return this.prisma.workspaceMember.findMany({
      where: { roleId },
      select: { clientId: true, advertiserId: true },
      distinct: ['clientId', 'advertiserId'],
    });
  }

  private toRole(raw: PrismaRole): Role {
    return {
      id: raw.id,
      name: raw.name,
      description: raw.description,
      workspaceId: raw.workspaceId,
      isSystem: raw.isSystem,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  private toPermission(raw: PrismaPermission): Permission {
    return {
      id: raw.id,
      key: raw.key,
      description: raw.description,
      category: raw.category,
      workspaceId: raw.workspaceId,
    };
  }

  private toRoleWithPermissions(raw: PrismaRoleWithRelations): RoleWithPermissions {
    return {
      ...this.toRole(raw),
      permissions: raw.permissions.map((rp) => this.toPermission(rp.permission)),
    };
  }
}
