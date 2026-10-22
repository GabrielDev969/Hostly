import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UpdateClientUseCase } from './update-client.use-case';
import { ClientsRepository } from '../repositories/clients.repository.interface';
import { Client } from '../entities/client.entity';

describe('UpdateClientUseCase', () => {
  let clients: jest.Mocked<ClientsRepository>;
  let useCase: UpdateClientUseCase;

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

  beforeEach(() => {
    clients = {
      findMany: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn((id, data) => Promise.resolve(client({ id, ...data }))),
      softDelete: jest.fn(),
      countDependents: jest.fn(),
    };
    useCase = new UpdateClientUseCase(clients);
  });

  it('updates name and status', async () => {
    clients.findById.mockResolvedValue(client());

    const result = await useCase.execute({ id: 'c1', name: 'Shopping B', status: 'paused' });

    expect(clients.update).toHaveBeenCalledWith('c1', { name: 'Shopping B', status: 'paused' });
    expect(result.status).toBe('paused');
  });

  it('throws 404 when the client is not in scope', async () => {
    clients.findById.mockResolvedValue(null);

    await expect(useCase.execute({ id: 'c1', name: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(clients.update).not.toHaveBeenCalled();
  });

  it.each(['paused', 'onboarding'] as const)(
    'refuses to move the internal client to %s',
    async (status) => {
      clients.findById.mockResolvedValue(client({ isInternal: true }));

      await expect(useCase.execute({ id: 'c1', status })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(clients.update).not.toHaveBeenCalled();
    },
  );

  it('lets the internal client be renamed', async () => {
    clients.findById.mockResolvedValue(client({ isInternal: true }));

    await useCase.execute({ id: 'c1', name: 'Own robots', status: 'active' });

    expect(clients.update).toHaveBeenCalledWith('c1', { name: 'Own robots', status: 'active' });
  });
});
