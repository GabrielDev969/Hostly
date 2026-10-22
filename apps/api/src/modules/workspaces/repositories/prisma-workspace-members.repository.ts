import { Injectable } from '@nestjs/common';
import { WorkspaceMembersRepository } from './workspace-members.repository.interface';
import type {
  CreateWorkspaceMemberData,
  WorkspaceMemberListItem,
  WorkspaceMemberWithRelations,
} from './workspace-members.repository.interface';
import { WorkspaceMember } from '../entities/workspace-member.entity';
import { PrismaService } from '@shared/database/prisma.service';
import { WorkspaceMember as PrismaWorkspaceMember } from '@prisma/client';
import { ADMIN_WORKSPACE_SLUG, SUPER_ADMIN_ROLE } from '@modules/rbac/constants/system';
import { Cacheable } from '@shared/cache/cacheable.decorator';
import { InvalidateCache } from '@shared/cache/invalidate-cache.decorator';
import { CACHE_NS, CACHE_TTL } from '@shared/cache/cache.constants';
import { CacheService } from '@shared/cache/cache.service';
import { ScopedPrismaService } from '@shared/tenancy/scoped-prisma.service';

@Injectable()
export class PrismaWorkspaceMembersRepository extends WorkspaceMembersRepository {
  constructor(
    private prisma: PrismaService,
    private scoped: ScopedPrismaService,
    protected readonly cacheService: CacheService,
  ) {
    super();
  }

  @InvalidateCache(CACHE_NS.workspaceMembers)
  async create(data: CreateWorkspaceMemberData): Promise<WorkspaceMember> {
    const member = await this.prisma.workspaceMember.create({ data });
    return this.toEntity(member);
  }

  async findById(id: string): Promise<WorkspaceMember | null> {
    const member = await this.scoped.client.workspaceMember.findUnique({
      where: { id },
    });
    return member ? this.toEntity(member) : null;
  }

  @Cacheable({
    namespace: CACHE_NS.workspaceMembers,
    key: (userId: string, workspaceId: string) => `${userId}:${workspaceId}`,
    ttlMs: CACHE_TTL.oneMinute,
  })
  async findByUserAndWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceMemberWithRelations | null> {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      include: {
        workspace: { select: { organizationId: true } },
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });

    if (!member) return null;

    return {
      ...this.toEntity(member),
      organizationId: member.workspace.organizationId,
      role: {
        id: member.role.id,
        name: member.role.name,
        isSystem: member.role.isSystem,
        permissions: member.role.permissions.map((rp) => rp.permission.key),
      },
    };
  }

  @Cacheable({
    namespace: CACHE_NS.workspaceMembers,
    key: (userId: string) => `superadmin:${userId}`,
    ttlMs: CACHE_TTL.oneMinute,
  })
  async findSuperAdminMembership(userId: string): Promise<WorkspaceMemberWithRelations | null> {
    const adminWorkspace = await this.prisma.workspace.findUnique({
      where: { slug: ADMIN_WORKSPACE_SLUG },
      select: { id: true },
    });
    if (!adminWorkspace) return null;
    const membership = await this.findByUserAndWorkspace(userId, adminWorkspace.id);
    // Any other role in __admin__ must not unlock every workspace.
    return membership?.role.name === SUPER_ADMIN_ROLE ? membership : null;
  }

  async findManyByWorkspaceWithRelations(workspaceId: string): Promise<WorkspaceMemberListItem[]> {
    const members = await this.scoped.client.workspaceMember.findMany({
      where: { workspaceId, user: { deletedAt: null } },
      include: {
        user: { select: { id: true, email: true, name: true } },
        role: { select: { id: true, name: true, isSystem: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
    return members.map((m) => ({
      ...this.toEntity(m),
      user: m.user,
      role: m.role,
    }));
  }

  @InvalidateCache(CACHE_NS.workspaceMembers)
  async updateRole(id: string, roleId: string): Promise<WorkspaceMember> {
    const member = await this.prisma.workspaceMember.update({
      where: { id },
      data: { roleId },
    });
    return this.toEntity(member);
  }

  @InvalidateCache(CACHE_NS.workspaceMembers)
  async delete(id: string): Promise<void> {
    await this.prisma.workspaceMember.delete({ where: { id } });
  }

  private toEntity(raw: PrismaWorkspaceMember): WorkspaceMember {
    return {
      id: raw.id,
      userId: raw.userId,
      workspaceId: raw.workspaceId,
      roleId: raw.roleId,
      clientId: raw.clientId,
      advertiserId: raw.advertiserId,
      joinedAt: raw.joinedAt,
    };
  }
}
