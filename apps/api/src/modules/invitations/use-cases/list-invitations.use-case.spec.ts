import { ListInvitationsUseCase } from './list-invitations.use-case';
import { InvitationsRepository } from '../repositories/invitations.repository.interface';

describe('ListInvitationsUseCase', () => {
  let invitations: jest.Mocked<InvitationsRepository>;
  let useCase: ListInvitationsUseCase;

  beforeEach(() => {
    invitations = {
      findManyByWorkspace: jest.fn(),
    } as unknown as jest.Mocked<InvitationsRepository>;
    useCase = new ListInvitationsUseCase(invitations);
  });

  it('returns mapped invitations for a workspace', async () => {
    invitations.findManyByWorkspace.mockResolvedValue([
      {
        id: 'i1',
        workspaceId: 'w1',
        email: 'jane@x.com',
        roleId: 'r1',
        invitedBy: 'admin',
        expiresAt: new Date('2026-02-01'),
        acceptedAt: null,
        createdAt: new Date('2026-01-01'),
      },
    ] as never);

    const result = await useCase.execute('w1');
    expect(invitations.findManyByWorkspace).toHaveBeenCalledWith('w1');
    expect(result).toHaveLength(1);
    expect(result[0]!.email).toBe('jane@x.com');
  });
});
