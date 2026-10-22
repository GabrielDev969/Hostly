import { Injectable } from '@nestjs/common';
import { Organization as OrganizationPrisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { Organization } from '../entities/organization.entity';
import {
  CreateOrganizationData,
  OrganizationsRepository,
} from './organizations.repository.interface';

@Injectable()
export class PrismaOrganizationsRepository extends OrganizationsRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async create(data: CreateOrganizationData): Promise<Organization> {
    const row = await this.prisma.organization.create({ data });
    return toEntity(row);
  }

  async findById(id: string): Promise<Organization | null> {
    const row = await this.prisma.organization.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? toEntity(row) : null;
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    const row = await this.prisma.organization.findFirst({
      where: { slug, deletedAt: null },
    });
    return row ? toEntity(row) : null;
  }

  async findByOwnerId(ownerId: string): Promise<Organization[]> {
    const rows = await this.prisma.organization.findMany({
      where: { ownerId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toEntity);
  }
}

function toEntity(raw: OrganizationPrisma): Organization {
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    ownerId: raw.ownerId,
    deletedAt: raw.deletedAt,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}
