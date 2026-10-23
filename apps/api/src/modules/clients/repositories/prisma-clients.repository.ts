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

class ClientInUse extends Error {
  constructor(readonly dependents: ClientDependents) {
    super('Client in use');
  }
}

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

  // Marking the row deleted locks it before counting, so an invitation being accepted either
  // commits its membership first (and the count sees it) or finds the client gone.
  async softDeleteUnlessUsed(id: string): Promise<ClientDependents> {
    try {
      return await this.scoped.client.$transaction(async (tx) => {
        const now = new Date();
        await tx.client.update({ where: { id, deletedAt: null }, data: { deletedAt: now } });
        const dependents: ClientDependents = {
          members: await tx.workspaceMember.count({ where: { clientId: id } }),
          pendingInvitations: await tx.invitation.count({
            where: { clientId: id, acceptedAt: null, expiresAt: { gt: now } },
          }),
          sites: await tx.site.count({ where: { clientId: id, deletedAt: null } }),
        };
        if (Object.values(dependents).some((count) => count > 0)) {
          throw new ClientInUse(dependents);
        }
        return dependents;
      });
    } catch (error) {
      if (error instanceof ClientInUse) return error.dependents;
      throw error;
    }
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
