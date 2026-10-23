import { Injectable } from '@nestjs/common';
import { Invitation as PrismaInvitation } from '@prisma/client';
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

  async create(data: CreateInvitationData): Promise<Invitation> {
    const created = await this.scoped.client.invitation.create({ data });
    return this.toEntity(created);
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
