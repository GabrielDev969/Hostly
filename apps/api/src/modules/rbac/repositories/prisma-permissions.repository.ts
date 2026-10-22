import { Injectable } from '@nestjs/common';
import { CreatePermissionData, PermissionsRepository } from './permissions.repository.interface';
import { Permission } from '../entities/permission.entity';
import { PrismaService } from '@shared/database/prisma.service';
import { Permission as PermissionPrisma } from '@prisma/client';
import { Cacheable } from '@shared/cache/cacheable.decorator';
import { CACHE_NS, CACHE_TTL } from '@shared/cache/cache.constants';
import { CacheService } from '@shared/cache/cache.service';

@Injectable()
export class PrismaPermissionsRepository extends PermissionsRepository {
  constructor(
    private prisma: PrismaService,
    protected readonly cacheService: CacheService,
  ) {
    super();
  }

  @Cacheable({
    namespace: CACHE_NS.permissions,
    key: () => 'all-global',
    ttlMs: CACHE_TTL.oneDay,
  })
  async findAll(): Promise<Permission[]> {
    const perms = await this.prisma.permission.findMany({
      where: { workspaceId: null },
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });
    return perms.map((p) => this.toEntity(p));
  }

  async findByKey(key: string): Promise<Permission | null> {
    const perm = await this.prisma.permission.findFirst({
      where: { key, workspaceId: null },
    });
    return perm ? this.toEntity(perm) : null;
  }

  async findManyByKeys(keys: string[]): Promise<Permission[]> {
    const perms = await this.prisma.permission.findMany({
      where: { key: { in: keys }, workspaceId: null },
    });
    return perms.map((p) => this.toEntity(p));
  }

  async findByCategory(category: string): Promise<Permission[]> {
    const perms = await this.prisma.permission.findMany({
      where: { category, workspaceId: null },
      orderBy: { key: 'asc' },
    });
    return perms.map((p) => this.toEntity(p));
  }

  async findByKeyInScope(key: string, workspaceId: string): Promise<Permission | null> {
    const perm = await this.prisma.permission.findFirst({
      where: {
        key,
        OR: [{ workspaceId: null }, { workspaceId }],
      },
    });
    return perm ? this.toEntity(perm) : null;
  }

  async findManyByKeysInScope(keys: string[], workspaceId: string): Promise<Permission[]> {
    const perms = await this.prisma.permission.findMany({
      where: {
        key: { in: keys },
        OR: [{ workspaceId: null }, { workspaceId }],
      },
    });
    return perms.map((p) => this.toEntity(p));
  }

  async findAllForWorkspace(workspaceId: string): Promise<Permission[]> {
    const perms = await this.prisma.permission.findMany({
      where: { OR: [{ workspaceId: null }, { workspaceId }] },
      orderBy: [{ workspaceId: 'asc' }, { category: 'asc' }, { key: 'asc' }],
    });
    return perms.map((p) => this.toEntity(p));
  }

  async findByIdInWorkspace(id: string, workspaceId: string): Promise<Permission | null> {
    const perm = await this.prisma.permission.findFirst({
      where: { id, workspaceId },
    });
    return perm ? this.toEntity(perm) : null;
  }

  async create(data: CreatePermissionData): Promise<Permission> {
    const perm = await this.prisma.permission.create({
      data: {
        key: data.key,
        description: data.description ?? null,
        category: data.category,
        workspaceId: data.workspaceId,
      },
    });
    return this.toEntity(perm);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.permission.delete({ where: { id } });
  }

  private toEntity(raw: PermissionPrisma): Permission {
    return {
      id: raw.id,
      key: raw.key,
      description: raw.description,
      category: raw.category,
      workspaceId: raw.workspaceId,
    };
  }
}
