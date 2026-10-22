import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RemoveMemberUseCase } from './remove-member.use-case';
import { WorkspaceMembersRepository } from '../repositories/workspace-members.repository.interface';
import { WorkspacesRepository } from '../repositories/workspaces.repository.interface';
import type { WorkspaceMember } from '../entities/workspace-member.entity';
import type { Workspace } from '../entities/workspace.entity';

function setup() {
  const members = {
    findById: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<WorkspaceMembersRepository>;
  const workspaces = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<WorkspacesRepository>;
  return {
    useCase: new RemoveMemberUseCase(members, workspaces),
    members,
    workspaces,
  };
}

const baseMember = (overrides: Partial<WorkspaceMember> = {}): WorkspaceMember => ({
  id: 'm1',
  userId: 'u2',
  workspaceId: 'w1',
  roleId: 'r1',
  clientId: null,
  advertiserId: null,
  joinedAt: new Date(),
  ...overrides,
});

const baseWorkspace = (overrides: Partial<Workspace> = {}): Workspace =>
  ({ id: 'w1', ownerId: 'u-owner', ...overrides }) as Workspace;

describe('RemoveMemberUseCase', () => {
  it('throws NotFound when member is missing or in another workspace', async () => {
    const { useCase, members } = setup();
    members.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({
        workspaceId: 'w1',
        memberId: 'm1',
        callerUserId: 'u1',
        callerPermissions: ['workspace:remove_member'],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws Forbidden when target is the workspace owner', async () => {
    const { useCase, members, workspaces } = setup();
    members.findById.mockResolvedValue(baseMember({ userId: 'u-owner' }));
    workspaces.findById.mockResolvedValue(baseWorkspace());
    await expect(
      useCase.execute({
        workspaceId: 'w1',
        memberId: 'm1',
        callerUserId: 'u1',
        callerPermissions: ['workspace:remove_member'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws Forbidden when caller lacks permission and is not removing self', async () => {
    const { useCase, members, workspaces } = setup();
    members.findById.mockResolvedValue(baseMember({ userId: 'u2' }));
    workspaces.findById.mockResolvedValue(baseWorkspace());
    await expect(
      useCase.execute({
        workspaceId: 'w1',
        memberId: 'm1',
        callerUserId: 'u1',
        callerPermissions: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(members.delete).not.toHaveBeenCalled();
  });

  it('allows self-leave even without remove_member permission', async () => {
    const { useCase, members, workspaces } = setup();
    members.findById.mockResolvedValue(baseMember({ userId: 'u1' }));
    workspaces.findById.mockResolvedValue(baseWorkspace());

    await useCase.execute({
      workspaceId: 'w1',
      memberId: 'm1',
      callerUserId: 'u1',
      callerPermissions: [],
    });

    expect(members.delete).toHaveBeenCalledWith('m1');
  });

  it('allows admin to remove others with permission', async () => {
    const { useCase, members, workspaces } = setup();
    members.findById.mockResolvedValue(baseMember({ userId: 'u2' }));
    workspaces.findById.mockResolvedValue(baseWorkspace());

    await useCase.execute({
      workspaceId: 'w1',
      memberId: 'm1',
      callerUserId: 'u1',
      callerPermissions: ['workspace:remove_member'],
    });

    expect(members.delete).toHaveBeenCalledWith('m1');
  });
});
