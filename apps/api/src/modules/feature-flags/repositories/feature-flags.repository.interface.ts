import { WorkspaceFeatureFlag } from '../entities/workspace-feature-flag.entity';

export abstract class FeatureFlagsRepository {
  abstract findByWorkspace(workspaceId: string): Promise<WorkspaceFeatureFlag[]>;
  abstract findOne(workspaceId: string, key: string): Promise<WorkspaceFeatureFlag | null>;
  abstract upsert(
    workspaceId: string,
    key: string,
    enabled: boolean,
  ): Promise<WorkspaceFeatureFlag>;
  abstract delete(workspaceId: string, key: string): Promise<void>;
}
