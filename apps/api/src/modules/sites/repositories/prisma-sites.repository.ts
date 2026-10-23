import { Injectable } from '@nestjs/common';
import { Prisma, Site as PrismaSite } from '@prisma/client';
import { ScopedPrismaService } from '@shared/tenancy/scoped-prisma.service';
import { Site } from '../entities/site.entity';
import { CreateSiteData, SitesRepository, UpdateSiteData } from './sites.repository.interface';

@Injectable()
export class PrismaSitesRepository extends SitesRepository {
  constructor(private scoped: ScopedPrismaService) {
    super();
  }

  async findMany(filter: { clientId?: string }): Promise<Site[]> {
    const sites = await this.scoped.client.site.findMany({
      where: { deletedAt: null, clientId: filter.clientId },
      orderBy: { name: 'asc' },
    });
    return sites.map((s) => this.toEntity(s));
  }

  async findById(id: string): Promise<Site | null> {
    const site = await this.scoped.client.site.findFirst({ where: { id, deletedAt: null } });
    return site ? this.toEntity(site) : null;
  }

  async create(data: CreateSiteData): Promise<Site> {
    // The tenant-scope extension stamps organizationId from the scope; the Prisma type cannot know that.
    const site = await this.scoped.client.site.create({
      data: data as Prisma.SiteUncheckedCreateInput,
    });
    return this.toEntity(site);
  }

  async update(id: string, data: UpdateSiteData): Promise<Site> {
    const site = await this.scoped.client.site.update({
      where: { id, deletedAt: null },
      data,
    });
    return this.toEntity(site);
  }

  async softDelete(id: string): Promise<void> {
    await this.scoped.client.site.update({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  async countRobots(id: string): Promise<number> {
    return this.scoped.client.robot.count({ where: { siteId: id } });
  }

  private toEntity(raw: PrismaSite): Site {
    return {
      id: raw.id,
      organizationId: raw.organizationId,
      clientId: raw.clientId,
      name: raw.name,
      timezone: raw.timezone,
      address: raw.address,
      deletedAt: raw.deletedAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }
}
