import { INestApplication } from '@nestjs/common';
import { CreateWorkspaceUseCase } from '../../src/modules/workspaces/use-cases/create-workspace.use-case';
import { getPrisma } from './test-database';

// Register no longer creates a tenant; tests that need an operator provision it like the seed does.
export async function provisionOperator(
  app: INestApplication,
  ownerEmail: string,
  options: { name?: string; isPersonal?: boolean } = {},
): Promise<string> {
  const owner = await getPrisma().user.findUniqueOrThrow({ where: { email: ownerEmail } });
  const workspace = await app.get(CreateWorkspaceUseCase).execute({
    userId: owner.id,
    name: options.name ?? 'Operator',
    internalClientName: `${options.name ?? 'Operator'} robots`,
    isPersonal: options.isPersonal ?? false,
  });
  return workspace.id;
}

// A client of the organization, written directly so member fixtures can point to it.
export async function createClient(
  organizationId: string,
  name: string,
  id?: string,
): Promise<string> {
  const client = await getPrisma().client.create({ data: { id, organizationId, name } });
  return client.id;
}

// Advertiser memberships are created directly until invitations carry an advertiser.
export async function addScopedMember(
  workspaceId: string,
  email: string,
  roleName: string,
  scope: { clientId: string | null; advertiserId: string | null },
): Promise<void> {
  const prisma = getPrisma();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const { organizationId } = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });
  const role = await prisma.role.findUniqueOrThrow({
    where: { workspaceId_name: { workspaceId, name: roleName } },
  });
  await prisma.workspaceMember.create({
    data: { userId: user.id, workspaceId, organizationId, roleId: role.id, ...scope },
  });
}
