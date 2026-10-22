export class WorkspaceMember {
  id: string;
  userId: string;
  workspaceId: string;
  roleId: string;
  clientId: string | null;
  advertiserId: string | null;
  joinedAt: Date;
}
