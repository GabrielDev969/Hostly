import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'child_process';
import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

let container: StartedPostgreSqlContainer | null = null;
let prismaClient: PrismaClient | null = null;
let pool: Pool | null = null;

export async function startTestDatabase(): Promise<string> {
  if (container) return container.getConnectionUri();

  container = await new PostgreSqlContainer('postgres:18.6-alpine3.24')
    .withDatabase('workspace_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;

  execSync('pnpm exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  pool = new Pool({ connectionString: url });
  prismaClient = new PrismaClient({ adapter: new PrismaPg(pool) });

  return url;
}

export async function stopTestDatabase(): Promise<void> {
  if (prismaClient) await prismaClient.$disconnect();
  if (pool) await pool.end();
  if (container) await container.stop();
  container = null;
  prismaClient = null;
  pool = null;
}

export function getPrisma(): PrismaClient {
  if (!prismaClient) throw new Error('Test database not started');
  return prismaClient;
}

export async function resetDatabase(): Promise<void> {
  const prisma = getPrisma();
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditLog",
      "Session",
      "Invitation",
      "RolePermission",
      "WorkspaceMember",
      "Role",
      "Workspace",
      "User",
      "Permission"
    RESTART IDENTITY CASCADE
  `);
}
