export class Invitation {
  id: string;
  email: string;
  workspaceId: string;
  roleId: string;
  invitedById: string;
  tokenHash: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}
