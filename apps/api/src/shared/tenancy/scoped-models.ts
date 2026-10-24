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
  // organizationId copies the workspace's, enforced by the composite foreign keys to Workspace and Client.
  WorkspaceMember: {
    organizationWhere: (scope) => ({ organizationId: scope.organizationId }),
    organizationData: (scope) => ({
      workspaceId: scope.workspaceId,
      organizationId: scope.organizationId,
    }),
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
  // The row keeps the client the robot had when it arrived; a client user sees only their client's history.
  TelemetrySnapshot: {
    organizationWhere: (scope) => ({ organizationId: scope.organizationId }),
    organizationData: (scope) => ({ organizationId: scope.organizationId }),
    clientField: 'clientId',
    advertiserField: null,
  },
  Invitation: {
    organizationWhere: (scope) => ({ organizationId: scope.organizationId }),
    organizationData: (scope) => ({
      workspaceId: scope.workspaceId,
      organizationId: scope.organizationId,
    }),
    clientField: 'clientId',
    advertiserField: null,
  },
};

export interface WorkspaceKeyedModel {
  // Rows with a null workspaceId are global: every scope reads them, only system work writes them.
  globalRows?: boolean;
}

// Models placed in a workspace by workspaceId alone, with no client dimension. They stay out of
// SCOPED_MODELS because to-one relations reach them from scoped rows (WorkspaceMember.role,
// RolePermission.permission) and client users read them; the rewriter pins their own queries to
// the scope's workspace instead. tenant-scope.registry.spec.ts fails if a workspaceId model is missing.
export const WORKSPACE_KEYED_MODELS: Readonly<Partial<Record<string, WorkspaceKeyedModel>>> = {
  Role: {},
  Permission: { globalRows: true },
  WorkspaceFeatureFlag: {},
};
