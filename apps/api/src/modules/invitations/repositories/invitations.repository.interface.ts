import { Invitation } from '../entities/invitation.entity';

export interface CreateInvitationData {
  email: string;
  workspaceId: string;
  roleId: string;
  invitedById: string;
  tokenHash: string;
  expiresAt: Date;
}

export abstract class InvitationsRepository {
  abstract create(data: CreateInvitationData): Promise<Invitation>;
  abstract findById(id: string): Promise<Invitation | null>;
  abstract findByTokenHash(tokenHash: string): Promise<Invitation | null>;
  abstract findManyByWorkspace(workspaceId: string): Promise<Invitation[]>;
  abstract findPendingByEmailAndWorkspace(
    email: string,
    workspaceId: string,
  ): Promise<Invitation | null>;
  abstract markAsAccepted(id: string): Promise<void>;
  abstract delete(id: string): Promise<void>;
}
