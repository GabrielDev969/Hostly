import { CreateClientUseCase } from './create-client.use-case';
import { ClientsRepository } from '../repositories/clients.repository.interface';
import { Client } from '../entities/client.entity';

describe('CreateClientUseCase', () => {
  let clients: jest.Mocked<ClientsRepository>;
  let useCase: CreateClientUseCase;

  beforeEach(() => {
    clients = {
      findMany: jest.fn(),
      findById: jest.fn(),
      create: jest.fn((data) =>
        Promise.resolve({
          id: 'c1',
          organizationId: 'org1',
          isInternal: false,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        } as Client),
      ),
      update: jest.fn(),
      softDeleteUnlessUsed: jest.fn(),
    };
    useCase = new CreateClientUseCase(clients);
  });

  it('starts a new client in onboarding', async () => {
    const result = await useCase.execute({ name: 'Shopping A' });

    expect(clients.create).toHaveBeenCalledWith({ name: 'Shopping A', status: 'onboarding' });
    expect(result).toMatchObject({ id: 'c1', status: 'onboarding', isInternal: false });
  });

  it('honors an explicit status', async () => {
    await useCase.execute({ name: 'Shopping A', status: 'active' });

    expect(clients.create).toHaveBeenCalledWith({ name: 'Shopping A', status: 'active' });
  });
});
