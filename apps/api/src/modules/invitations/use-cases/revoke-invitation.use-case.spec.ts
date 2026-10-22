import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RevokeInvitationUseCase } from './revoke-invitation.use-case';
import { InvitationsRepository } from '../repositories/invitations.repository.interface';

describe('RevokeInvitationUseCase', () => {
  let invitations: jest.Mocked<InvitationsRepository>;
  let useCase: RevokeInvitationUseCase;

  beforeEach(() => {
    invitations = {
      findById: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<InvitationsRepository>;
    useCase = new RevokeInvitationUseCase(invitations);
  });

  it('throws NotFound when invitation does not exist', async () => {
    invitations.findById.mockResolvedValue(null);
    await expect(useCase.execute({ invitationId: 'i1', workspaceId: 'w1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws NotFound when invitation belongs to a different workspace', async () => {
    invitations.findById.mockResolvedValue({
      id: 'i1',
      workspaceId: 'other',
      acceptedAt: null,
    } as never);
    await expect(useCase.execute({ invitationId: 'i1', workspaceId: 'w1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws BadRequest when invitation has already been accepted', async () => {
    invitations.findById.mockResolvedValue({
      id: 'i1',
      workspaceId: 'w1',
      acceptedAt: new Date(),
    } as never);
    await expect(useCase.execute({ invitationId: 'i1', workspaceId: 'w1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(invitations.delete).not.toHaveBeenCalled();
  });

  it('deletes pending invitation in the correct workspace', async () => {
    invitations.findById.mockResolvedValue({
      id: 'i1',
      workspaceId: 'w1',
      acceptedAt: null,
    } as never);
    await useCase.execute({ invitationId: 'i1', workspaceId: 'w1' });
    expect(invitations.delete).toHaveBeenCalledWith('i1');
  });
});
