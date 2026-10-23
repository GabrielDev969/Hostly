import { Invitation } from '../entities/invitation.entity';

export interface CreateInvitationData {
  email: string;
  workspaceId: string;
  roleId: string;
  invitedById: string;
  clientId: string | null;
  tokenHash: string;
  expiresAt: Date;
}

export abstract class InvitationsRepository {
  // Null when the invitation's client is gone, checked under the client's row lock.
  abstract create(data: CreateInvitationData): Promise<Invitation | null>;
  abstract findById(id: string): Promise<Invitation | null>;
  abstract findByTokenHash(tokenHash: string): Promise<Invitation | null>;
  abstract findManyByWorkspace(workspaceId: string): Promise<Invitation[]>;
  abstract findPendingByEmailAndWorkspace(
    email: string,
    workspaceId: string,
  ): Promise<Invitation | null>;
  abstract delete(id: string): Promise<void>;
}
