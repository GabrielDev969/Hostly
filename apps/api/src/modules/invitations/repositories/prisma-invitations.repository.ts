import { Injectable } from '@nestjs/common';
import { Invitation as PrismaInvitation } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { Invitation } from '../entities/invitation.entity';
import { CreateInvitationData, InvitationsRepository } from './invitations.repository.interface';

@Injectable()
export class PrismaInvitationsRepository extends InvitationsRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async create(data: CreateInvitationData): Promise<Invitation> {
    const created = await this.prisma.invitation.create({ data });
    return this.toEntity(created);
  }

  async findById(id: string): Promise<Invitation | null> {
    const found = await this.prisma.invitation.findUnique({ where: { id } });
    return found ? this.toEntity(found) : null;
  }

  async findByTokenHash(tokenHash: string): Promise<Invitation | null> {
    const found = await this.prisma.invitation.findUnique({
      where: { tokenHash },
    });
    return found ? this.toEntity(found) : null;
  }

  async findManyByWorkspace(workspaceId: string): Promise<Invitation[]> {
    const items = await this.prisma.invitation.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((i) => this.toEntity(i));
  }

  async findPendingByEmailAndWorkspace(
    email: string,
    workspaceId: string,
  ): Promise<Invitation | null> {
    const found = await this.prisma.invitation.findFirst({
      where: {
        email,
        workspaceId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    return found ? this.toEntity(found) : null;
  }

  async markAsAccepted(id: string): Promise<void> {
    await this.prisma.invitation.update({
      where: { id },
      data: { acceptedAt: new Date() },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.invitation.delete({ where: { id } });
  }

  private toEntity(raw: PrismaInvitation): Invitation {
    return {
      id: raw.id,
      email: raw.email,
      workspaceId: raw.workspaceId,
      roleId: raw.roleId,
      invitedById: raw.invitedById,
      tokenHash: raw.tokenHash,
      expiresAt: raw.expiresAt,
      acceptedAt: raw.acceptedAt,
      createdAt: raw.createdAt,
    };
  }
}
