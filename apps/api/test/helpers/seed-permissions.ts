import { ALL_PERMISSION_KEYS } from '../../src/modules/rbac/constants/permissions';
import { getPrisma } from './test-database';

export async function seedPermissions(): Promise<void> {
  await getPrisma().permission.createMany({
    data: ALL_PERMISSION_KEYS.map((key) => ({
      key,
      category: key.split(':')[0]!,
    })),
    skipDuplicates: true,
  });
}
