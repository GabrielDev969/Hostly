import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UpdateMemberRoleUseCase } from './update-member-role.use-case';
import { WorkspaceMembersRepository } from '../repositories/workspace-members.repository.interface';
import { WorkspacesRepository } from '../repositories/workspaces.repository.interface';
import { RolesRepository } from '@modules/rbac/repositories/roles.repository.interface';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import type { WorkspaceMember } from '../entities/workspace-member.entity';
import type { Workspace } from '../entities/workspace.entity';
import type { RoleWithPermissions } from '@modules/rbac/repositories/roles.repository.interface';

function setup() {
  const members = {
    findById: jest.fn(),
    updateRole: jest.fn(),
  } as unknown as jest.Mocked<WorkspaceMembersRepository>;
  const workspaces = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<WorkspacesRepository>;
  const roles = {
    findByIdInWorkspace: jest.fn(),
  } as unknown as jest.Mocked<RolesRepository>;
  const users = {
    invalidateTokens: jest.fn(),
  } as unknown as jest.Mocked<UsersRepository>;
  return {
    useCase: new UpdateMemberRoleUseCase(members, workspaces, roles, users),
    members,
    workspaces,
    roles,
    users,
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
  ({
    id: 'w1',
    ownerId: 'u-owner',
    ...overrides,
  }) as Workspace;

describe('UpdateMemberRoleUseCase', () => {
  it('throws NotFound when member is missing', async () => {
    const { useCase, members } = setup();
    members.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({ workspaceId: 'w1', memberId: 'm1', roleId: 'r2' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFound when member belongs to another workspace', async () => {
    const { useCase, members } = setup();
    members.findById.mockResolvedValue(baseMember({ workspaceId: 'w2' }));
    await expect(
      useCase.execute({ workspaceId: 'w1', memberId: 'm1', roleId: 'r2' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws Forbidden when target is the workspace owner', async () => {
    const { useCase, members, workspaces } = setup();
    members.findById.mockResolvedValue(baseMember({ userId: 'u-owner' }));
    workspaces.findById.mockResolvedValue(baseWorkspace());
    await expect(
      useCase.execute({ workspaceId: 'w1', memberId: 'm1', roleId: 'r2' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws BadRequest when role is not in the workspace', async () => {
    const { useCase, members, workspaces, roles } = setup();
    members.findById.mockResolvedValue(baseMember());
    workspaces.findById.mockResolvedValue(baseWorkspace());
    roles.findByIdInWorkspace.mockResolvedValue(null);
    await expect(
      useCase.execute({ workspaceId: 'w1', memberId: 'm1', roleId: 'r-bad' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates the role and invalidates the member tokens when all checks pass', async () => {
    const { useCase, members, workspaces, roles, users } = setup();
    members.findById.mockResolvedValue(baseMember());
    workspaces.findById.mockResolvedValue(baseWorkspace());
    roles.findByIdInWorkspace.mockResolvedValue({
      id: 'r2',
    } as RoleWithPermissions);
    members.updateRole.mockResolvedValue(baseMember({ roleId: 'r2' }));

    await useCase.execute({ workspaceId: 'w1', memberId: 'm1', roleId: 'r2' });

    expect(members.updateRole).toHaveBeenCalledWith('m1', 'r2');
    expect(users.invalidateTokens).toHaveBeenCalledWith('u2');
  });
});
