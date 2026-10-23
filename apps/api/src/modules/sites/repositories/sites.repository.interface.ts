import { Site } from '../entities/site.entity';

export interface CreateSiteData {
  clientId: string;
  name: string;
  timezone: string;
  address: string | null;
}

export interface UpdateSiteData {
  name?: string;
  timezone?: string;
  address?: string | null;
}

export abstract class SitesRepository {
  abstract findMany(filter: { clientId?: string }): Promise<Site[]>;
  abstract findById(id: string): Promise<Site | null>;
  // Null when the client is gone, checked under the client's row lock.
  abstract create(data: CreateSiteData): Promise<Site | null>;
  abstract update(id: string, data: UpdateSiteData): Promise<Site>;
  // Deletes only when no robot points to the site, counted under the row lock; returns the count.
  abstract softDeleteUnlessUsed(id: string): Promise<number>;
}
