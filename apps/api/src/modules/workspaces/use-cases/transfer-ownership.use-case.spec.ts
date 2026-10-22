import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { TransferOwnershipUseCase } from './transfer-ownership.use-case';
import { WorkspacesRepository } from '../repositories/workspaces.repository.interface';
import { WorkspaceMembersRepository } from '../repositories/workspace-members.repository.interface';
import { RolesRepository } from '@modules/rbac/repositories/roles.repository.interface';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { CryptoUtil } from '@shared/utils/crypto.util';
import type { Workspace } from '../entities/workspace.entity';
import type { WorkspaceMember } from '../entities/workspace-member.entity';
import type { User } from '@modules/users/entities/user.entity';
import type { RoleWithPermissions } from '@modules/rbac/repositories/roles.repository.interface';

function setup() {
  const workspaces = {
    findById: jest.fn(),
    transferOwnership: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<WorkspacesRepository>;
  const members = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<WorkspaceMembersRepository>;
  const roles = {
    findManyByWorkspace: jest.fn(),
  } as unknown as jest.Mocked<RolesRepository>;
  const users = {
    findById: jest.fn(),
    invalidateTokens: jest.fn(),
  } as unknown as jest.Mocked<UsersRepository>;
  return {
    useCase: new TransferOwnershipUseCase(workspaces, members, roles, users),
    workspaces,
    members,
    roles,
    users,
  };
}

const workspace = { id: 'w1', ownerId: 'u-owner' } as Workspace;
const targetMember = {
  id: 'm-target',
  userId: 'u-new',
  workspaceId: 'w1',
  clientId: null,
  advertiserId: null,
} as WorkspaceMember;
const ownerUser = { id: 'u-owner', passwordHash: 'hash' } as User;
const workspaceRoles = [
  { id: 'r-owner', name: 'operator_admin' } as RoleWithPermissions,
  { id: 'r-staff', name: 'operator_staff' } as RoleWithPermissions,
];

const validInput = {
  workspaceId: 'w1',
  callerUserId: 'u-owner',
  targetMemberId: 'm-target',
  password: 'StrongPass@1',
};

describe('TransferOwnershipUseCase', () => {
  beforeEach(() => {
    jest.spyOn(CryptoUtil, 'verifyPassword').mockResolvedValue(true);
  });
  afterEach(() => jest.restoreAllMocks());

  it('throws NotFound when workspace is missing', async () => {
    const { useCase, workspaces } = setup();
    workspaces.findById.mockResolvedValue(null);
    await expect(useCase.execute(validInput)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws Forbidden when caller is not the current owner', async () => {
    const { useCase, workspaces } = setup();
    workspaces.findById.mockResolvedValue({
      ...workspace,
      ownerId: 'someone-else',
    });
    await expect(useCase.execute(validInput)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws Unauthorized when caller password is wrong', async () => {
    const { useCase, workspaces, users } = setup();
    workspaces.findById.mockResolvedValue(workspace);
    users.findById.mockResolvedValue(ownerUser);
    jest.spyOn(CryptoUtil, 'verifyPassword').mockResolvedValueOnce(false);
    await expect(useCase.execute(validInput)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws NotFound when target member belongs to a different workspace', async () => {
    const { useCase, workspaces, users, members } = setup();
    workspaces.findById.mockResolvedValue(workspace);
    users.findById.mockResolvedValue(ownerUser);
    members.findById.mockResolvedValue({
      ...targetMember,
      workspaceId: 'w2',
    });
    await expect(useCase.execute(validInput)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws BadRequest when target is the caller', async () => {
    const { useCase, workspaces, users, members } = setup();
    workspaces.findById.mockResolvedValue(workspace);
    users.findById.mockResolvedValue(ownerUser);
    members.findById.mockResolvedValue({
      ...targetMember,
      userId: 'u-owner',
    });
    await expect(useCase.execute(validInput)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequest when the operator_admin role is missing', async () => {
    const { useCase, workspaces, users, members, roles } = setup();
    workspaces.findById.mockResolvedValue(workspace);
    users.findById.mockResolvedValue(ownerUser);
    members.findById.mockResolvedValue(targetMember);
    roles.findManyByWorkspace.mockResolvedValue([]);
    await expect(useCase.execute(validInput)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('calls transferOwnership with correct role ids and invalidates both users on the happy path', async () => {
    const { useCase, workspaces, users, members, roles } = setup();
    workspaces.findById.mockResolvedValue(workspace);
    users.findById.mockResolvedValue(ownerUser);
    members.findById.mockResolvedValue(targetMember);
    roles.findManyByWorkspace.mockResolvedValue(workspaceRoles);

    await useCase.execute(validInput);

    expect(workspaces.transferOwnership).toHaveBeenCalledWith({
      workspaceId: 'w1',
      fromUserId: 'u-owner',
      toUserId: 'u-new',
      ownerRoleId: 'r-owner',
      adminRoleId: 'r-owner',
    });
    expect(users.invalidateTokens).toHaveBeenCalledWith('u-owner');
    expect(users.invalidateTokens).toHaveBeenCalledWith('u-new');
  });

  it('refuses to hand ownership to a client-scoped member', async () => {
    const { useCase, workspaces, users, members, roles } = setup();
    workspaces.findById.mockResolvedValue(workspace);
    users.findById.mockResolvedValue(ownerUser);
    members.findById.mockResolvedValue({ ...targetMember, clientId: 'client-a' });
    roles.findManyByWorkspace.mockResolvedValue(workspaceRoles);

    await expect(useCase.execute(validInput)).rejects.toBeInstanceOf(BadRequestException);
    expect(workspaces.transferOwnership).not.toHaveBeenCalled();
  });
});
