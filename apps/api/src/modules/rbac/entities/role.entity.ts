export class Role {
  id: string;
  name: string;
  description: string | null;
  workspaceId: string;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}
