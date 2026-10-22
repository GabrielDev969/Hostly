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
  abstract create(data: CreateSiteData): Promise<Site>;
  abstract update(id: string, data: UpdateSiteData): Promise<Site>;
  abstract softDelete(id: string): Promise<void>;
}
