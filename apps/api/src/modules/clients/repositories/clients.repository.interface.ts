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
  abstract softDelete(id: string): Promise<void>;
  abstract countDependents(id: string): Promise<ClientDependents>;
}
