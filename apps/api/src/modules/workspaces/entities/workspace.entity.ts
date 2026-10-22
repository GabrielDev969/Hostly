export class Workspace {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
  ownerId: string;
  organizationId: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
