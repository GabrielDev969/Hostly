import { ADMIN_WORKSPACE_SLUG, SUPER_ADMIN_ROLE } from '../../src/modules/rbac/constants/system';
import { getPrisma } from './test-database';

// Builds the admin workspace the way the seed does and makes the user its SuperAdmin member.
export async function provisionSuperAdmin(userId: string): Promise<void> {
  const prisma = getPrisma();
  const organization = await prisma.organization.create({
    data: {
      name: 'System Administration',
      slug: `org-${ADMIN_WORKSPACE_SLUG}`,
      ownerId: userId,
    },
  });
  const adminWs = await prisma.workspace.create({
    data: {
      name: 'System Administration',
      slug: ADMIN_WORKSPACE_SLUG,
      isPersonal: false,
      ownerId: userId,
      organizationId: organization.id,
    },
  });
  const allPerms = await prisma.permission.findMany();
  const role = await prisma.role.create({
    data: {
      name: SUPER_ADMIN_ROLE,
      description: 'Global access',
      workspaceId: adminWs.id,
      isSystem: true,
      permissions: {
        create: allPerms.map((p) => ({ permissionId: p.id })),
      },
    },
  });
  await prisma.workspaceMember.create({
    data: {
      userId,
      workspaceId: adminWs.id,
      organizationId: organization.id,
      roleId: role.id,
    },
  });
}
