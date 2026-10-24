export class Invitation {
  id: string;
  email: string;
  workspaceId: string;
  organizationId: string;
  roleId: string;
  invitedById: string;
  clientId: string | null;
  tokenHash: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}
