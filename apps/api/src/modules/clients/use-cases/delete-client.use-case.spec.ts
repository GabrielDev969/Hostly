import { ConflictException, NotFoundException } from '@nestjs/common';
import { DeleteClientUseCase } from './delete-client.use-case';
import { ClientDependents, ClientsRepository } from '../repositories/clients.repository.interface';
import { Client } from '../entities/client.entity';

describe('DeleteClientUseCase', () => {
  let clients: jest.Mocked<ClientsRepository>;
  let useCase: DeleteClientUseCase;

  const client = (overrides: Partial<Client> = {}): Client => ({
    id: 'c1',
    organizationId: 'org1',
    name: 'Shopping A',
    status: 'active',
    isInternal: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  const none: ClientDependents = { members: 0, pendingInvitations: 0, sites: 0 };

  beforeEach(() => {
    clients = {
      findMany: jest.fn(),
      findById: jest.fn().mockResolvedValue(client()),
      create: jest.fn(),
      update: jest.fn(),
      softDeleteUnlessUsed: jest.fn().mockResolvedValue(none),
    };
    useCase = new DeleteClientUseCase(clients);
  });

  it('soft deletes a client nothing points to', async () => {
    await useCase.execute('c1');

    expect(clients.softDeleteUnlessUsed).toHaveBeenCalledWith('c1');
  });

  it('throws 404 when the client is not in scope', async () => {
    clients.findById.mockResolvedValue(null);

    await expect(useCase.execute('c1')).rejects.toBeInstanceOf(NotFoundException);
    expect(clients.softDeleteUnlessUsed).not.toHaveBeenCalled();
  });

  it('never deletes the internal client', async () => {
    clients.findById.mockResolvedValue(client({ isInternal: true }));

    await expect(useCase.execute('c1')).rejects.toBeInstanceOf(ConflictException);
    expect(clients.softDeleteUnlessUsed).not.toHaveBeenCalled();
  });

  it.each([
    ['members', { ...none, members: 1 }],
    ['pendingInvitations', { ...none, pendingInvitations: 2 }],
    ['sites', { ...none, sites: 3 }],
  ])('throws 409 while the client still has %s', async (kind, dependents) => {
    clients.softDeleteUnlessUsed.mockResolvedValue(dependents);

    await expect(useCase.execute('c1')).rejects.toThrow(
      new ConflictException(`Client still has ${kind}; remove them first`),
    );
  });
});
