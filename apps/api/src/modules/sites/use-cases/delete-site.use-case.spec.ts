import { ConflictException, NotFoundException } from '@nestjs/common';
import { DeleteSiteUseCase } from './delete-site.use-case';
import { SitesRepository } from '../repositories/sites.repository.interface';

describe('DeleteSiteUseCase', () => {
  let sites: jest.Mocked<SitesRepository>;
  let useCase: DeleteSiteUseCase;

  beforeEach(() => {
    sites = {
      findMany: jest.fn(),
      findById: jest.fn().mockResolvedValue({ id: 's1' }),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      countRobots: jest.fn().mockResolvedValue(0),
    };
    useCase = new DeleteSiteUseCase(sites);
  });

  it('soft deletes a site without robots', async () => {
    await useCase.execute('s1');

    expect(sites.softDelete).toHaveBeenCalledWith('s1');
  });

  it('throws 404 when the site is not in scope', async () => {
    sites.findById.mockResolvedValue(null);

    await expect(useCase.execute('s1')).rejects.toBeInstanceOf(NotFoundException);
    expect(sites.softDelete).not.toHaveBeenCalled();
  });

  it('throws 409 while a robot is still on the site', async () => {
    sites.countRobots.mockResolvedValue(1);

    await expect(useCase.execute('s1')).rejects.toThrow(
      new ConflictException('Site still has robots; move them first'),
    );
    expect(sites.softDelete).not.toHaveBeenCalled();
  });
});
