import { NotFoundException } from '@nestjs/common';
import { CreateSiteUseCase } from './create-site.use-case';
import { SitesRepository } from '../repositories/sites.repository.interface';
import { ClientsRepository } from '@modules/clients/repositories/clients.repository.interface';
import { Client } from '@modules/clients/entities/client.entity';
import { Site } from '../entities/site.entity';

describe('CreateSiteUseCase', () => {
  let sites: jest.Mocked<SitesRepository>;
  let clients: jest.Mocked<ClientsRepository>;
  let useCase: CreateSiteUseCase;

  beforeEach(() => {
    sites = {
      findMany: jest.fn(),
      findById: jest.fn(),
      create: jest.fn((data) =>
        Promise.resolve({
          id: 's1',
          organizationId: 'org1',
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        } as Site),
      ),
      update: jest.fn(),
      softDelete: jest.fn(),
      countRobots: jest.fn(),
    };
    clients = {
      findMany: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDeleteUnlessUsed: jest.fn(),
    };
    useCase = new CreateSiteUseCase(sites, clients);
  });

  it('creates the site under a client in scope', async () => {
    clients.findById.mockResolvedValue({ id: 'c1' } as Client);

    const result = await useCase.execute({
      clientId: 'c1',
      name: 'Piso L2',
      timezone: 'America/Sao_Paulo',
    });

    expect(sites.create).toHaveBeenCalledWith({
      clientId: 'c1',
      name: 'Piso L2',
      timezone: 'America/Sao_Paulo',
      address: null,
    });
    expect(result).toMatchObject({ id: 's1', clientId: 'c1', address: null });
  });

  it('throws 404 when the client is not in scope (other organization or deleted)', async () => {
    clients.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ clientId: 'c9', name: 'Piso L2', timezone: 'UTC' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(sites.create).not.toHaveBeenCalled();
  });
});
