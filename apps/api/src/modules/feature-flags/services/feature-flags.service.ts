import { Injectable, NotFoundException } from '@nestjs/common';
import { CacheService } from '@shared/cache/cache.service';
import { CACHE_NS, CACHE_TTL } from '@shared/cache/cache.constants';
import { Cacheable } from '@shared/cache/cacheable.decorator';
import { InvalidateCache } from '@shared/cache/invalidate-cache.decorator';
import { FeatureFlagsRepository } from '../repositories/feature-flags.repository.interface';
import {
  ALL_FEATURES,
  FEATURE_BY_KEY,
  FeatureDefinition,
  isKnownFeatureKey,
} from '../constants/features';
import { WorkspaceFeatureFlag } from '../entities/workspace-feature-flag.entity';

export interface EffectiveFeature {
  key: string;
  description: string;
  enabled: boolean;
  defaultEnabled: boolean;
  overridden: boolean;
}

@Injectable()
export class FeatureFlagsService {
  constructor(
    private readonly repository: FeatureFlagsRepository,
    protected readonly cacheService: CacheService,
  ) {}

  @Cacheable({
    namespace: CACHE_NS.featureFlags,
    key: (workspaceId: string) => `workspace:${workspaceId}`,
    ttlMs: CACHE_TTL.oneHour,
  })
  async getEffective(workspaceId: string): Promise<EffectiveFeature[]> {
    const overrides = await this.repository.findByWorkspace(workspaceId);
    const overrideMap = new Map(overrides.map((o) => [o.key, o.enabled]));
    return ALL_FEATURES.map((def) => this.merge(def, overrideMap.get(def.key)));
  }

  async isEnabled(workspaceId: string, key: string): Promise<boolean> {
    const def = FEATURE_BY_KEY.get(key);
    if (!def) return false;
    const effective = await this.getEffective(workspaceId);
    return effective.find((f) => f.key === key)?.enabled ?? def.defaultEnabled;
  }

  @InvalidateCache(CACHE_NS.featureFlags)
  async setOverride(
    workspaceId: string,
    key: string,
    enabled: boolean,
  ): Promise<WorkspaceFeatureFlag> {
    if (!isKnownFeatureKey(key)) {
      throw new NotFoundException(`Unknown feature key "${key}"`);
    }
    return this.repository.upsert(workspaceId, key, enabled);
  }

  @InvalidateCache(CACHE_NS.featureFlags)
  async clearOverride(workspaceId: string, key: string): Promise<void> {
    if (!isKnownFeatureKey(key)) {
      throw new NotFoundException(`Unknown feature key "${key}"`);
    }
    await this.repository.delete(workspaceId, key);
  }

  private merge(def: FeatureDefinition, override: boolean | undefined): EffectiveFeature {
    return {
      key: def.key,
      description: def.description,
      defaultEnabled: def.defaultEnabled,
      enabled: override ?? def.defaultEnabled,
      overridden: override !== undefined,
    };
  }
}
