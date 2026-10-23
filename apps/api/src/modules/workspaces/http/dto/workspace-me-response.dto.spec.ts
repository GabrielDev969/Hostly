import { toWorkspaceMeDto } from './workspace-me-response.dto';
import type { WorkspaceContext } from '@shared/types/workspace-context.type';

const workspace: WorkspaceContext = {
  id: 'w1',
  member: { id: 'm1', userId: 'u1', workspaceId: 'w1', roleId: 'r1' },
  role: { id: 'r1', name: 'client_admin', isSystem: true },
};

const scope = (clientId: string | null, advertiserId: string | null) => ({
  organizationId: 'o1',
  workspaceId: 'w1',
  clientId,
  advertiserId,
});

describe('toWorkspaceMeDto', () => {
  it('derives the scope kind from the membership ids', () => {
    expect(toWorkspaceMeDto(workspace, scope(null, null), []).scope.kind).toBe('operator');
    expect(toWorkspaceMeDto(workspace, scope('c1', null), []).scope.kind).toBe('client');
    expect(toWorkspaceMeDto(workspace, scope('c1', 'a1'), []).scope.kind).toBe('advertiser');
  });

  it('passes the client and advertiser ids through', () => {
    expect(toWorkspaceMeDto(workspace, scope('c1', 'a1'), []).scope).toEqual({
      kind: 'advertiser',
      clientId: 'c1',
      advertiserId: 'a1',
    });
  });

  it('returns the role and the permissions it was given, sorted', () => {
    const dto = toWorkspaceMeDto(workspace, scope('c1', null), ['robot:read', 'client:read']);
    expect(dto).toEqual({
      workspaceId: 'w1',
      role: { id: 'r1', name: 'client_admin', isSystem: true },
      scope: { kind: 'client', clientId: 'c1', advertiserId: null },
      permissions: ['client:read', 'robot:read'],
    });
  });
});
