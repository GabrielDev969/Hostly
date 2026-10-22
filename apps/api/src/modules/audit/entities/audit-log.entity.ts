export class AuditLog {
  id: string;
  userId: string | null;
  workspaceId: string | null;
  organizationId: string | null;
  clientId: string | null;
  action: string;
  resource: string | null;
  resourceId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON column
  metadata: Record<string, any> | null;
  ipAddress: string | null;
  userAgent: string | null;
  prevHash: string | null;
  hash: string;
  createdAt: Date;
}
