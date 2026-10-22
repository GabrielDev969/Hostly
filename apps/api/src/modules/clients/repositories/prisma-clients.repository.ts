import { Injectable } from '@nestjs/common';
import { Prisma, Client as ClientRow } from '@prisma/client';
import { ScopedPrismaService } from '@shared/tenancy/scoped-prisma.service';
import { Client, ClientStatus } from '../entities/client.entity';
import {
  ClientDependents,
  ClientsRepository,
  CreateClientData,
  UpdateClientData,
} from './clients.repository.interface';

@Injectable()
export class PrismaClientsRepository extends ClientsRepository {
  constructor(private scoped: ScopedPrismaService) {
    super();
  }

  async findMany(filter: { status?: ClientStatus }): Promise<Client[]> {
    const clients = await this.scoped.client.client.findMany({
      where: { deletedAt: null, status: filter.status },
      orderBy: { name: 'asc' },
    });
    return clients.map((c) => this.toEntity(c));
  }

  async findById(id: string): Promise<Client | null> {
    const client = await this.scoped.client.client.findFirst({ where: { id, deletedAt: null } });
    return client ? this.toEntity(client) : null;
  }

  async create(data: CreateClientData): Promise<Client> {
    // The tenant-scope extension stamps organizationId from the scope; the Prisma type cannot know that.
    const client = await this.scoped.client.client.create({
      data: data as Prisma.ClientUncheckedCreateInput,
    });
    return this.toEntity(client);
  }

  async update(id: string, data: UpdateClientData): Promise<Client> {
    const client = await this.scoped.client.client.update({
      where: { id, deletedAt: null },
      data,
    });
    return this.toEntity(client);
  }

  async softDelete(id: string): Promise<void> {
    await this.scoped.client.client.update({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  async countDependents(id: string): Promise<ClientDependents> {
    const [members, pendingInvitations, sites] = await Promise.all([
      this.scoped.client.workspaceMember.count({ where: { clientId: id } }),
      this.scoped.client.invitation.count({
        where: { clientId: id, acceptedAt: null, expiresAt: { gt: new Date() } },
      }),
      this.scoped.client.site.count({ where: { clientId: id, deletedAt: null } }),
    ]);
    return { members, pendingInvitations, sites };
  }

  private toEntity(raw: ClientRow): Client {
    return {
      id: raw.id,
      organizationId: raw.organizationId,
      name: raw.name,
      status: raw.status,
      isInternal: raw.isInternal,
      deletedAt: raw.deletedAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }
}
