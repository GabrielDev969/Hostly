export interface FeatureDefinition {
  key: string;
  description: string;
  defaultEnabled: boolean;
}

export const FEATURES = {
  BILLING: {
    key: 'billing',
    description: 'Billing module and invoice endpoints',
    defaultEnabled: false,
  },
  BETA_USAGE_GRAPHS: {
    key: 'beta:usage-graphs',
    description: 'Beta usage analytics dashboards',
    defaultEnabled: false,
  },
  ADVANCED_AUDIT_EXPORT: {
    key: 'advanced:audit-export',
    description: 'Advanced audit log export (CSV/SIEM stream)',
    defaultEnabled: false,
  },
} as const satisfies Record<string, FeatureDefinition>;

export const ALL_FEATURES: FeatureDefinition[] = Object.values(FEATURES);

export const FEATURE_BY_KEY: ReadonlyMap<string, FeatureDefinition> = new Map(
  ALL_FEATURES.map((f) => [f.key, f]),
);

export function isKnownFeatureKey(key: string): boolean {
  return FEATURE_BY_KEY.has(key);
}
