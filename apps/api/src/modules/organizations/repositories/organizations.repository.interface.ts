import { Organization } from '../entities/organization.entity';

export interface CreateOrganizationData {
  name: string;
  slug: string;
  ownerId: string;
}

export abstract class OrganizationsRepository {
  abstract create(data: CreateOrganizationData): Promise<Organization>;
  abstract findById(id: string): Promise<Organization | null>;
  abstract findBySlug(slug: string): Promise<Organization | null>;
  abstract findByOwnerId(ownerId: string): Promise<Organization[]>;
}
