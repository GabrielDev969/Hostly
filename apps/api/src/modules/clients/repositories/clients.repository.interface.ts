import { Client, ClientStatus } from '../entities/client.entity';

export interface CreateClientData {
  name: string;
  status: ClientStatus;
}

export interface UpdateClientData {
  name?: string;
  status?: ClientStatus;
}

// What still points to a client and so blocks deleting it.
export interface ClientDependents {
  members: number;
  pendingInvitations: number;
  sites: number;
}

export abstract class ClientsRepository {
  abstract findMany(filter: { status?: ClientStatus }): Promise<Client[]>;
  abstract findById(id: string): Promise<Client | null>;
  abstract create(data: CreateClientData): Promise<Client>;
  abstract update(id: string, data: UpdateClientData): Promise<Client>;
  // Deletes only when nothing points to the client, counted under the row lock; returns the counts.
  abstract softDeleteUnlessUsed(id: string): Promise<ClientDependents>;
}
