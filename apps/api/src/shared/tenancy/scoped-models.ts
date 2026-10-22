import type { TenantScope } from './tenant-scope';

export type Where = Record<string, unknown>;

export interface ScopedModel {
  organizationWhere: (scope: TenantScope) => Where;
  // Scalar columns a create must carry to belong to the scope's organization.
  organizationData: (scope: TenantScope) => Where;
  clientField: string | null;
  advertiserField: string | null;
}

// Every business model must be listed here; tenant-scope.registry.spec.ts fails otherwise.
export const SCOPED_MODELS: Readonly<Partial<Record<string, ScopedModel>>> = {
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
};

// Tenant roots: they carry organizationId but are the boundary itself, resolved by the WorkspaceGuard.
export const TENANT_ROOT_MODELS: readonly string[] = ['Organization', 'Workspace'];
