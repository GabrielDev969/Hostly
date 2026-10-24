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

  // Clients
  { key: 'client:read', category: 'client', description: 'View clients' },
  { key: 'client:create', category: 'client', description: 'Create clients' },
  { key: 'client:update', category: 'client', description: 'Update clients' },
  { key: 'client:delete', category: 'client', description: 'Delete clients' },

  // Sites
  { key: 'site:read', category: 'site', description: 'View sites' },
  { key: 'site:create', category: 'site', description: 'Create sites' },
  { key: 'site:update', category: 'site', description: 'Update sites' },
  { key: 'site:delete', category: 'site', description: 'Delete sites' },

  // Robots
  { key: 'robot:read', category: 'robot', description: 'View robots' },
  { key: 'robot:pair', category: 'robot', description: 'Pair robots by their on-screen code' },
  { key: 'robot:update', category: 'robot', description: 'Rename robots' },
  { key: 'robot:move', category: 'robot', description: 'Move robots to another site' },
  { key: 'robot:revoke', category: 'robot', description: 'Revoke robot device tokens' },
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

function readInternalClientName(): string {
  const name = process.env.SEED_INTERNAL_CLIENT_NAME;
  if (!name) throw new Error('SEED_INTERNAL_CLIENT_NAME must be defined in .env');
  return name;
}

// The operator's own robots (fair, demo, event) live under its internal client; the database keeps
// it unique per organization, always active and never deleted.
async function seedInternalClient(organizationId: string): Promise<void> {
  const name = readInternalClientName();
  const existing = await prisma.client.findFirst({ where: { organizationId, isInternal: true } });
  if (existing) {
    await prisma.client.update({ where: { id: existing.id }, data: { name } });
  } else {
    await prisma.client.create({
      data: { organizationId, name, status: 'active', isInternal: true },
    });
  }
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
    create: {
      userId: admin.id,
      workspaceId: workspace.id,
      organizationId: organization.id,
      roleId: ownerRoleId,
    },
  });

  await seedInternalClient(organization.id);

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
    create: {
      userId: user.id,
      workspaceId: workspace.id,
      organizationId: organization.id,
      roleId: role.id,
    },
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
