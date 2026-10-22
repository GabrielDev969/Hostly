import { SetMetadata } from '@nestjs/common';
export const REQUIRE_PERMISSIONS_KEY = 'requirePermissions';
export const RequirePermissions = (...perms: string[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, perms);
