import { InvitationsController } from './invitations.controller';
import { SendInvitationUseCase } from '../use-cases/send-invitation.use-case';
import { ListInvitationsUseCase } from '../use-cases/list-invitations.use-case';
import { AcceptInvitationUseCase } from '../use-cases/accept-invitation.use-case';
import { RevokeInvitationUseCase } from '../use-cases/revoke-invitation.use-case';
import type { WorkspaceContext } from '@shared/types/workspace-context.type';
import type { AuthenticatedUser } from '@shared/types/authenticated-user.type';

describe('InvitationsController', () => {
  let send: jest.Mocked<SendInvitationUseCase>;
  let list: jest.Mocked<ListInvitationsUseCase>;
  let accept: jest.Mocked<AcceptInvitationUseCase>;
  let revoke: jest.Mocked<RevokeInvitationUseCase>;
  let controller: InvitationsController;

  const workspace = { id: 'w1' } as WorkspaceContext;
  const user = { id: 'u1', sessionId: 's1' } as AuthenticatedUser;

  beforeEach(() => {
    send = {
      execute: jest.fn().mockResolvedValue({ id: 'i1' }),
    } as unknown as jest.Mocked<SendInvitationUseCase>;
    list = {
      execute: jest.fn().mockResolvedValue([] as never),
    } as unknown as jest.Mocked<ListInvitationsUseCase>;
    accept = {
      execute: jest.fn().mockResolvedValue({ workspaceId: 'w1', roleId: 'r1' }),
    } as unknown as jest.Mocked<AcceptInvitationUseCase>;
    revoke = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RevokeInvitationUseCase>;
    controller = new InvitationsController(send, list, accept, revoke);
  });

  it('list forwards workspace id', async () => {
    await controller.list(workspace);
    expect(list.execute).toHaveBeenCalledWith('w1');
  });

  it('send forwards dto + workspace + user', async () => {
    await controller.send({ email: 'jane@x.com', roleId: 'r1' }, workspace, user);
    expect(send.execute).toHaveBeenCalledWith({
      workspaceId: 'w1',
      email: 'jane@x.com',
      roleId: 'r1',
      invitedById: 'u1',
    });
  });

  it('revoke forwards id and workspace', async () => {
    await controller.revoke('i1', workspace);
    expect(revoke.execute).toHaveBeenCalledWith({
      invitationId: 'i1',
      workspaceId: 'w1',
    });
  });

  it('accept forwards token and user id', async () => {
    const result = await controller.accept({ token: 'tok' }, user);
    expect(accept.execute).toHaveBeenCalledWith({ token: 'tok', userId: 'u1' });
    expect(result).toEqual({ workspaceId: 'w1', roleId: 'r1' });
  });
});
