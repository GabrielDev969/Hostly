import '../src/config/load-root-env';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import {
  ADMIN_WORKSPACE_SLUG,
  ADMIN_WORKSPACE_NAME,
  SUPER_ADMIN_ROLE,
} from '../src/modules/rbac/constants/system';
import { DEFAULT_ROLES, OWNER_ROLE } from '../src/modules/rbac/constants/roles';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

const PERMISSIONS = [
  // User
  { key: 'user:read', category: 'user', description: 'View users' },
  { key: 'user:create', category: 'user', description: 'Create users' },
  { key: 'user:update', category: 'user', description: 'Update users' },
  { key: 'user:delete', category: 'user', description: 'Delete users' },

  // Workspace
  {
    key: 'workspace:read',
    category: 'workspace',
    description: 'View workspace',
  },
  {
    key: 'workspace:update',
    category: 'workspace',
    description: 'Update workspace',
  },
  {
    key: 'workspace:delete',
    category: 'workspace',
    description: 'Delete workspace',
  },
  {
    key: 'workspace:invite',
    category: 'workspace',
    description: 'Invite members',
  },
  {
    key: 'workspace:remove_member',
    category: 'workspace',
    description: 'Remove members',
  },
  {
    key: 'workspace:transfer_ownership',
    category: 'workspace',
    description: 'Transfer workspace ownership to another member',
  },

  // RBAC
  { key: 'role:read', category: 'rbac', description: 'View roles' },
  { key: 'role:create', category: 'rbac', description: 'Create roles' },
  { key: 'role:update', category: 'rbac', description: 'Update roles' },
  { key: 'role:delete', category: 'rbac', description: 'Delete roles' },
  {
    key: 'role:assign',
    category: 'rbac',
    description: 'Assign roles to members',
  },

  // Audit
  {
    key: 'audit:read',
    category: 'audit',
    description: 'View audit logs',
  },
];

interface SuperAdminEnv {
  email: string;
  password: string;
  name: string;
}

function readSuperAdminEnv(): SuperAdminEnv {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const name = process.env.SUPER_ADMIN_NAME;

  if (!email || !password || !name) {
    throw new Error(
      'SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD and SUPER_ADMIN_NAME must be defined in .env',
    );
  }

  return { email, password, name };
}

async function seedPermissions(): Promise<string[]> {
  console.log('🌱 Seeding permissions...');
  for (const perm of PERMISSIONS) {
    const existing = await prisma.permission.findFirst({
      where: { key: perm.key, workspaceId: null },
      select: { id: true },
    });
    if (existing) {
      await prisma.permission.update({
        where: { id: existing.id },
        data: { description: perm.description, category: perm.category },
      });
    } else {
      await prisma.permission.create({ data: { ...perm, workspaceId: null } });
    }
  }
  console.log(`✅ ${PERMISSIONS.length} permissions seeded`);
  return PERMISSIONS.map((p) => p.key);
}

function readOperatorEnv(): { name: string; slug: string } {
  const name = process.env.SEED_OPERATOR_NAME;
  const slug = process.env.SEED_OPERATOR_SLUG;
  if (!name || !slug) {
    throw new Error('SEED_OPERATOR_NAME and SEED_OPERATOR_SLUG must be defined in .env');
  }
  return { name, slug };
}

// The operator (Organization) with its single workspace, the five Hostly roles and the admin as
// operator_admin. The brand name comes from .env: no brand is hardcoded.
async function seedOperator(adminEmail: string): Promise<void> {
  const operator = readOperatorEnv();
  console.log(`🌱 Seeding operator "${operator.name}"...`);

  const admin = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });

  const organization = await prisma.organization.upsert({
    where: { slug: operator.slug },
    update: { name: operator.name },
    create: { name: operator.name, slug: operator.slug, ownerId: admin.id },
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: operator.slug },
    update: { name: operator.name, organizationId: organization.id },
    create: {
      name: operator.name,
      slug: operator.slug,
      isPersonal: false,
      ownerId: admin.id,
      organizationId: organization.id,
    },
  });

  let ownerRoleId = '';
  for (const definition of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({
      where: { workspaceId_name: { workspaceId: workspace.id, name: definition.name } },
      update: { description: definition.description, isSystem: definition.isSystem },
      create: {
        name: definition.name,
        description: definition.description,
        workspaceId: workspace.id,
        isSystem: definition.isSystem,
      },
    });
    const permissions = await prisma.permission.findMany({
      where: { key: { in: definition.permissionKeys }, workspaceId: null },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
    if (definition.name === OWNER_ROLE) ownerRoleId = role.id;
  }

  await prisma.workspaceMember.upsert({
    where: { userId_workspaceId: { userId: admin.id, workspaceId: workspace.id } },
    update: { roleId: ownerRoleId, clientId: null, advertiserId: null },
    create: { userId: admin.id, workspaceId: workspace.id, roleId: ownerRoleId },
  });

  console.log(`✅ Operator "${operator.name}" provisioned with ${adminEmail} as ${OWNER_ROLE}`);
}

async function seedSuperAdmin(allPermissionKeys: string[]): Promise<void> {
  const env = readSuperAdminEnv();
  console.log('🌱 Seeding super admin...');

  const passwordHash = await argon2.hash(env.password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const user = await prisma.user.upsert({
    where: { email: env.email },
    update: { name: env.name, emailVerifiedAt: new Date() },
    create: {
      email: env.email,
      name: env.name,
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });

  const organization = await prisma.organization.upsert({
    where: { slug: `org-${ADMIN_WORKSPACE_SLUG}` },
    update: { ownerId: user.id },
    create: {
      name: ADMIN_WORKSPACE_NAME,
      slug: `org-${ADMIN_WORKSPACE_SLUG}`,
      ownerId: user.id,
    },
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: ADMIN_WORKSPACE_SLUG },
    update: { organizationId: organization.id },
    create: {
      name: ADMIN_WORKSPACE_NAME,
      slug: ADMIN_WORKSPACE_SLUG,
      isPersonal: false,
      ownerId: user.id,
      organizationId: organization.id,
    },
  });

  const permissions = await prisma.permission.findMany({
    where: { key: { in: allPermissionKeys } },
  });

  const role = await prisma.role.upsert({
    where: {
      workspaceId_name: { workspaceId: workspace.id, name: SUPER_ADMIN_ROLE },
    },
    update: { description: 'Global access across all workspaces' },
    create: {
      name: SUPER_ADMIN_ROLE,
      description: 'Global access across all workspaces',
      workspaceId: workspace.id,
      isSystem: true,
    },
  });

  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  await prisma.rolePermission.createMany({
    data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
  });

  await prisma.workspaceMember.upsert({
    where: {
      userId_workspaceId: { userId: user.id, workspaceId: workspace.id },
    },
    update: { roleId: role.id },
    create: { userId: user.id, workspaceId: workspace.id, roleId: role.id },
  });

  console.log(`✅ Super admin "${env.email}" provisioned`);
}

async function main() {
  const permissionKeys = await seedPermissions();
  await seedSuperAdmin(permissionKeys);
  await seedOperator(readSuperAdminEnv().email);
  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Failed to run seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
