import type { TenantScope } from './tenant-scope';

export type Where = Record<string, unknown>;

export interface ScopedModel {
  organizationWhere: (scope: TenantScope) => Where;
  // Scalar columns a create must carry to belong to the scope's organization.
  organizationData: (scope: TenantScope) => Where;
  clientField: string | null;
  advertiserField: string | null;
  // Tenant roots: every user of the organization may read its own root, but only system work creates one.
  root?: boolean;
}

// Every business model must be listed here; tenant-scope.registry.spec.ts fails otherwise.
export const SCOPED_MODELS: Readonly<Partial<Record<string, ScopedModel>>> = {
  Organization: {
    organizationWhere: (scope) => ({ id: scope.organizationId }),
    organizationData: (scope) => ({ id: scope.organizationId }),
    clientField: null,
    advertiserField: null,
    root: true,
  },
  Workspace: {
    organizationWhere: (scope) => ({ organizationId: scope.organizationId }),
    organizationData: (scope) => ({ organizationId: scope.organizationId }),
    clientField: null,
    advertiserField: null,
    root: true,
  },
  WorkspaceMember: {
    organizationWhere: (scope) => ({ workspace: { organizationId: scope.organizationId } }),
    organizationData: (scope) => ({ workspaceId: scope.workspaceId }),
    clientField: 'clientId',
    advertiserField: 'advertiserId',
  },
  AuditLog: {
    organizationWhere: (scope) => ({ organizationId: scope.organizationId }),
    organizationData: (scope) => ({ organizationId: scope.organizationId }),
    clientField: 'clientId',
    advertiserField: null,
  },
  // The client row is the client scope itself: a client user reaches only the row whose id is theirs.
  Client: {
    organizationWhere: (scope) => ({ organizationId: scope.organizationId }),
    organizationData: (scope) => ({ organizationId: scope.organizationId }),
    clientField: 'id',
    advertiserField: null,
  },
  Site: {
    organizationWhere: (scope) => ({ organizationId: scope.organizationId }),
    organizationData: (scope) => ({ organizationId: scope.organizationId }),
    clientField: 'clientId',
    advertiserField: null,
  },
  // No advertiserField: advertisers never see robots.
  Robot: {
    organizationWhere: (scope) => ({ organizationId: scope.organizationId }),
    organizationData: (scope) => ({ organizationId: scope.organizationId }),
    clientField: 'clientId',
    advertiserField: null,
  },
  Invitation: {
    organizationWhere: (scope) => ({ workspace: { organizationId: scope.organizationId } }),
    organizationData: (scope) => ({ workspaceId: scope.workspaceId }),
    clientField: 'clientId',
    advertiserField: null,
  },
};
