import { Injectable } from '@nestjs/common';
import { Prisma, Site as PrismaSite } from '@prisma/client';
import { ScopedPrismaService } from '@shared/tenancy/scoped-prisma.service';
import { Site } from '../entities/site.entity';
import { CreateSiteData, SitesRepository, UpdateSiteData } from './sites.repository.interface';

class SiteInUse extends Error {
  constructor(readonly robots: number) {
    super('Site in use');
  }
}

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

  // Touching the client locks it (lock order in apps/api/CLAUDE.md), so a concurrent delete either
  // counts this site or the site finds the client gone.
  async create(data: CreateSiteData): Promise<Site | null> {
    return this.scoped.client.$transaction(async (tx) => {
      const { count } = await tx.client.updateMany({
        where: { id: data.clientId, deletedAt: null },
        data: { updatedAt: new Date() },
      });
      if (count === 0) return null;
      // The tenant-scope extension stamps organizationId from the scope; the Prisma type cannot know that.
      const site = await tx.site.create({ data: data as Prisma.SiteUncheckedCreateInput });
      return this.toEntity(site);
    });
  }

  async update(id: string, data: UpdateSiteData): Promise<Site> {
    const site = await this.scoped.client.site.update({
      where: { id, deletedAt: null },
      data,
    });
    return this.toEntity(site);
  }

  // Marking the row deleted locks it before counting, so a robot being moved or approved here
  // either commits first (and the count sees it) or finds the site gone.
  async softDeleteUnlessUsed(id: string): Promise<number> {
    try {
      return await this.scoped.client.$transaction(async (tx) => {
        await tx.site.update({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
        const robots = await tx.robot.count({ where: { siteId: id } });
        if (robots > 0) throw new SiteInUse(robots);
        return robots;
      });
    } catch (error) {
      if (error instanceof SiteInUse) return error.robots;
      throw error;
    }
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
