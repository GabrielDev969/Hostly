import { Injectable } from '@nestjs/common';
import { Prisma, Invitation as PrismaInvitation } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ScopedPrismaService } from '@shared/tenancy/scoped-prisma.service';
import { Invitation } from '../entities/invitation.entity';
import { CreateInvitationData, InvitationsRepository } from './invitations.repository.interface';

@Injectable()
export class PrismaInvitationsRepository extends InvitationsRepository {
  constructor(
    private prisma: PrismaService,
    private scoped: ScopedPrismaService,
  ) {
    super();
  }

  // An invitation to a client locks the client first (lock order in apps/api/CLAUDE.md), so a
  // concurrent delete either counts it or the invitation finds the client gone.
  async create(input: CreateInvitationData): Promise<Invitation | null> {
    // The tenant-scope extension stamps organizationId from the scope; the Prisma type cannot know that.
    const data = input as Prisma.InvitationUncheckedCreateInput;
    const { clientId } = input;
    if (!clientId) return this.toEntity(await this.scoped.client.invitation.create({ data }));
    return this.scoped.client.$transaction(async (tx) => {
      const { count } = await tx.client.updateMany({
        where: { id: clientId, deletedAt: null },
        data: { updatedAt: new Date() },
      });
      if (count === 0) return null;
      return this.toEntity(await tx.invitation.create({ data }));
    });
  }

  async findById(id: string): Promise<Invitation | null> {
    const found = await this.scoped.client.invitation.findUnique({ where: { id } });
    return found ? this.toEntity(found) : null;
  }

  // findByTokenHash serves the accept flow, which runs before the user has a membership and so
  // without a scope; everything else goes through the scoped client.
  async findByTokenHash(tokenHash: string): Promise<Invitation | null> {
    const found = await this.prisma.invitation.findUnique({
      where: { tokenHash },
    });
    return found ? this.toEntity(found) : null;
  }

  async findManyByWorkspace(workspaceId: string): Promise<Invitation[]> {
    const items = await this.scoped.client.invitation.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((i) => this.toEntity(i));
  }

  async findPendingByEmailAndWorkspace(
    email: string,
    workspaceId: string,
  ): Promise<Invitation | null> {
    const found = await this.scoped.client.invitation.findFirst({
      where: {
        email,
        workspaceId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    return found ? this.toEntity(found) : null;
  }

  async delete(id: string): Promise<void> {
    await this.scoped.client.invitation.delete({ where: { id } });
  }

  private toEntity(raw: PrismaInvitation): Invitation {
    return {
      id: raw.id,
      email: raw.email,
      workspaceId: raw.workspaceId,
      organizationId: raw.organizationId,
      roleId: raw.roleId,
      invitedById: raw.invitedById,
      clientId: raw.clientId,
      tokenHash: raw.tokenHash,
      expiresAt: raw.expiresAt,
      acceptedAt: raw.acceptedAt,
      createdAt: raw.createdAt,
    };
  }
}
