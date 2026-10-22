export class Site {
  id: string;
  organizationId: string;
  clientId: string;
  name: string;
  timezone: string;
  address: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
