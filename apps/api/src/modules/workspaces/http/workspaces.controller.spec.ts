import { WorkspacesController } from './workspaces.controller';
import { GetWorkspaceUseCase } from '../use-cases/get-workspace.use-case';
import { ListWorkspacesUseCase } from '../use-cases/list-workspaces.use-case';
import { UpdateWorkspaceUseCase } from '../use-cases/update-workspace.use-case';
import { DeleteWorkspaceUseCase } from '../use-cases/delete-workspace.use-case';
import { ListMembersUseCase } from '../use-cases/list-members.use-case';
import { UpdateMemberRoleUseCase } from '../use-cases/update-member-role.use-case';
import { RemoveMemberUseCase } from '../use-cases/remove-member.use-case';
import { TransferOwnershipUseCase } from '../use-cases/transfer-ownership.use-case';
import { WorkspaceResponseDto } from './dto/workspace-response.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import type { WorkspaceMemberListItem } from '../repositories/workspace-members.repository.interface';
import type { WorkspaceContext } from '@shared/types/workspace-context.type';
import type { AuthenticatedUser } from '@shared/types/authenticated-user.type';

describe('WorkspacesController', () => {
  const workspace = { id: 'w1' } as WorkspaceContext;
  const currentUser: AuthenticatedUser = { id: 'u1' };

  const workspaceDto: WorkspaceResponseDto = {
    id: 'w1',
    name: 'Acme',
    slug: 'acme',
    isPersonal: false,
    ownerId: 'u1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  let getWorkspace: jest.Mocked<GetWorkspaceUseCase>;
  let listWorkspaces: jest.Mocked<ListWorkspacesUseCase>;
  let updateWorkspace: jest.Mocked<UpdateWorkspaceUseCase>;
  let deleteWorkspace: jest.Mocked<DeleteWorkspaceUseCase>;
  let listMembers: jest.Mocked<ListMembersUseCase>;
  let updateMemberRole: jest.Mocked<UpdateMemberRoleUseCase>;
  let removeMember: jest.Mocked<RemoveMemberUseCase>;
  let transferOwnership: jest.Mocked<TransferOwnershipUseCase>;
  let controller: WorkspacesController;

  beforeEach(() => {
    getWorkspace = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetWorkspaceUseCase>;
    listWorkspaces = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListWorkspacesUseCase>;
    updateWorkspace = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateWorkspaceUseCase>;
    deleteWorkspace = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<DeleteWorkspaceUseCase>;
    listMembers = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListMembersUseCase>;
    updateMemberRole = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<UpdateMemberRoleUseCase>;
    removeMember = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RemoveMemberUseCase>;
    transferOwnership = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TransferOwnershipUseCase>;
    controller = new WorkspacesController(
      getWorkspace,
      listWorkspaces,
      updateWorkspace,
      deleteWorkspace,
      listMembers,
      updateMemberRole,
      removeMember,
      transferOwnership,
    );
  });

  it('list passes the current user id to ListWorkspacesUseCase', async () => {
    listWorkspaces.execute.mockResolvedValue([workspaceDto]);

    const result = await controller.list(currentUser);

    expect(listWorkspaces.execute).toHaveBeenCalledWith('u1');
    expect(result).toEqual([workspaceDto]);
  });

  it('findOne resolves the workspace from the request context', async () => {
    getWorkspace.execute.mockResolvedValue(workspaceDto);

    const result = await controller.findOne(workspace.id, workspace);

    expect(getWorkspace.execute).toHaveBeenCalledWith('w1');
    expect(result).toBe(workspaceDto);
  });

  it('update forwards id and name to UpdateWorkspaceUseCase', async () => {
    const dto: UpdateWorkspaceDto = { name: 'Acme Inc.' };
    updateWorkspace.execute.mockResolvedValue({
      ...workspaceDto,
      name: 'Acme Inc.',
    });

    await controller.update(dto, workspace);

    expect(updateWorkspace.execute).toHaveBeenCalledWith({
      id: 'w1',
      name: 'Acme Inc.',
    });
  });

  it('remove delegates to DeleteWorkspaceUseCase with the workspace id', async () => {
    deleteWorkspace.execute.mockResolvedValue(undefined);

    await controller.remove(workspace);

    expect(deleteWorkspace.execute).toHaveBeenCalledWith('w1');
  });

  it('listMembersEndpoint forwards workspace id and maps to DTO', async () => {
    const member: WorkspaceMemberListItem = {
      id: 'm1',
      userId: 'u2',
      workspaceId: 'w1',
      roleId: 'r1',
      clientId: null,
      advertiserId: null,
      joinedAt: new Date('2026-01-01'),
      user: { id: 'u2', email: 'b@x.com', name: 'B' },
      role: { id: 'r1', name: 'Member', isSystem: true },
    };
    listMembers.execute.mockResolvedValue([member]);

    const result = await controller.listMembersEndpoint(workspace);

    expect(listMembers.execute).toHaveBeenCalledWith('w1');
    expect(result).toEqual([
      expect.objectContaining({
        id: 'm1',
        user: member.user,
        role: member.role,
      }),
    ]);
  });

  it('updateMemberRoleEndpoint forwards memberId, roleId, and workspace id', async () => {
    await controller.updateMemberRoleEndpoint('m1', { roleId: 'r2' }, workspace);
    expect(updateMemberRole.execute).toHaveBeenCalledWith({
      workspaceId: 'w1',
      memberId: 'm1',
      roleId: 'r2',
    });
  });

  it('removeMemberEndpoint forwards caller identity and permissions', async () => {
    await controller.removeMemberEndpoint('m9', workspace, currentUser, [
      'workspace:remove_member',
    ]);
    expect(removeMember.execute).toHaveBeenCalledWith({
      workspaceId: 'w1',
      memberId: 'm9',
      callerUserId: 'u1',
      callerPermissions: ['workspace:remove_member'],
    });
  });

  it('transferOwnershipEndpoint forwards password, target and caller', async () => {
    await controller.transferOwnershipEndpoint(
      { targetMemberId: 'm2', password: 'StrongPass@1' },
      workspace,
      currentUser,
    );
    expect(transferOwnership.execute).toHaveBeenCalledWith({
      workspaceId: 'w1',
      callerUserId: 'u1',
      targetMemberId: 'm2',
      password: 'StrongPass@1',
    });
  });
});
