export interface WorkspaceContext {
  id: string;
  member: {
    id: string;
    userId: string;
    workspaceId: string;
    roleId: string;
  };
  role: {
    id: string;
    name: string;
    isSystem: boolean;
  };
}
