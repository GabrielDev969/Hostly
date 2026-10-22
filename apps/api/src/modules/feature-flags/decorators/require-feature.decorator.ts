import { SetMetadata } from '@nestjs/common';

export const REQUIRE_FEATURE_KEY = 'require_feature';

export const RequireFeature = (featureKey: string) => SetMetadata(REQUIRE_FEATURE_KEY, featureKey);
