export const CLIENT_STATUSES = ['onboarding', 'active', 'paused'] as const;

export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export class Client {
  id: string;
  organizationId: string;
  name: string;
  status: ClientStatus;
  isInternal: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
