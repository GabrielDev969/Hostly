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
    isPersonal: options.isPersonal ?? false,
  });
  return workspace.id;
}

// Client and advertiser memberships are created directly until invitations carry a client (#16).
export async function addScopedMember(
  workspaceId: string,
  email: string,
  roleName: string,
  scope: { clientId: string | null; advertiserId: string | null },
): Promise<void> {
  const prisma = getPrisma();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const role = await prisma.role.findUniqueOrThrow({
    where: { workspaceId_name: { workspaceId, name: roleName } },
  });
  await prisma.workspaceMember.create({
    data: { userId: user.id, workspaceId, roleId: role.id, ...scope },
  });
}
