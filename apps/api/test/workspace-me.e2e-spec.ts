import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  startTestDatabase,
  stopTestDatabase,
  resetDatabase,
  getPrisma,
} from './helpers/test-database';
import { seedPermissions } from './helpers/seed-permissions';
import type { TestEmailDispatcher } from './helpers/test-email-dispatcher';
import { registerAndVerify } from './helpers/auth-flow';
import { addScopedMember, createClient, provisionOperator } from './helpers/operator';
import { provisionSuperAdmin } from './helpers/super-admin';
import { DEFAULT_ROLES, withinCeiling } from '../src/modules/rbac/constants/roles';

const PASSWORD = 'StrongPass@123';

const USERS = {
  opAdmin: 'op-admin@example.com',
  opStaff: 'op-staff@example.com',
  clientAdminA: 'client-admin-a@example.com',
  clientEditorA: 'client-editor-a@example.com',
  advertiserA: 'advertiser-a@example.com',
  customB: 'custom-b@example.com',
  otherOperator: 'other-operator@example.com',
  root: 'root@example.com',
} as const;

type UserKey = keyof typeof USERS;

interface WorkspaceMeBody {
  workspaceId: string;
  role: { id: string; name: string; isSystem: boolean };
  scope: { kind: string; clientId: string | null; advertiserId: string | null };
  permissions: string[];
}

describe('GET /workspaces/:workspaceId/me (e2e)', () => {
  let app: INestApplication;
  let server: App;
  let emailDispatcher: TestEmailDispatcher;
  const tokens = {} as Record<UserKey, string>;
  let workspace: string;
  let otherWorkspace: string;
  let clientA: string;
  let clientB: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  };

  const me = (user: UserKey, workspaceId = workspace) =>
    request(server)
      .get(`/api/v1/workspaces/${workspaceId}/me`)
      .set('Authorization', `Bearer ${tokens[user]}`);

  const expectedPermissions = (
    role: string,
    scope: { clientId: string | null; advertiserId: string | null },
  ) => withinCeiling(DEFAULT_ROLES.find((r) => r.name === role)!.permissionKeys, scope).sort();

  beforeAll(async () => {
    await startTestDatabase();
    const { createTestApp } = require('./helpers/test-app') as typeof import('./helpers/test-app');
    ({ app, emailDispatcher } = await createTestApp());
    server = app.getHttpServer() as App;

    await resetDatabase();
    await seedPermissions();

    for (const email of Object.values(USERS)) {
      await registerAndVerify(server, emailDispatcher, { email, name: email, password: PASSWORD });
    }
    workspace = await provisionOperator(app, USERS.opAdmin, { name: 'Operator X' });
    otherWorkspace = await provisionOperator(app, USERS.otherOperator, { name: 'Operator Y' });
    const { organizationId } = await getPrisma().workspace.findUniqueOrThrow({
      where: { id: workspace },
    });
    clientA = await createClient(organizationId, 'Shopping A');
    clientB = await createClient(organizationId, 'Shopping B');

    await addScopedMember(workspace, USERS.opStaff, 'operator_staff', {
      clientId: null,
      advertiserId: null,
    });
    const inA = { clientId: clientA, advertiserId: null };
    await addScopedMember(workspace, USERS.clientAdminA, 'client_admin', inA);
    await addScopedMember(workspace, USERS.clientEditorA, 'client_editor', inA);
    await addScopedMember(workspace, USERS.advertiserA, 'advertiser', {
      clientId: clientA,
      advertiserId: 'adv-1',
    });

    // A custom role written straight to the database, holding a permission above the client ceiling.
    const prisma = getPrisma();
    const permissionIds = await prisma.permission.findMany({
      where: { key: { in: ['user:read', 'client:read'] } },
    });
    await prisma.role.create({
      data: {
        name: 'custom_reader',
        description: 'Custom role above the client ceiling',
        workspaceId: workspace,
        isSystem: false,
        permissions: { create: permissionIds.map((p) => ({ permissionId: p.id })) },
      },
    });
    await addScopedMember(workspace, USERS.customB, 'custom_reader', {
      clientId: clientB,
      advertiserId: null,
    });

    for (const key of Object.keys(USERS) as UserKey[]) tokens[key] = await login(USERS[key]);
    const root = await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tokens.root}`)
      .expect(200);
    await provisionSuperAdmin(root.body.id as string);
  });

  afterAll(async () => {
    await app.close();
    await stopTestDatabase();
  });

  it.each([
    ['opAdmin', 'operator_admin', 'operator', null, null],
    ['opStaff', 'operator_staff', 'operator', null, null],
    ['clientAdminA', 'client_admin', 'client', 'A', null],
    ['clientEditorA', 'client_editor', 'client', 'A', null],
    ['advertiserA', 'advertiser', 'advertiser', 'A', 'adv-1'],
  ] as const)(
    '%s gets the %s role, its scope and its permissions within the ceiling',
    async (user, role, kind, client, advertiserId) => {
      const clientId = client === 'A' ? clientA : null;
      const res = await me(user).expect(200);
      const body = res.body as WorkspaceMeBody;

      expect(body.workspaceId).toBe(workspace);
      expect(body.role).toMatchObject({ name: role, isSystem: true });
      expect(body.scope).toEqual({ kind, clientId, advertiserId });
      expect(body.permissions).toEqual(expectedPermissions(role, { clientId, advertiserId }));
    },
  );

  it('cuts a custom role down to the ceiling of a client membership', async () => {
    const body = (await me('customB').expect(200)).body as WorkspaceMeBody;

    expect(body.role).toMatchObject({ name: 'custom_reader', isSystem: false });
    expect(body.scope).toEqual({ kind: 'client', clientId: clientB, advertiserId: null });
    expect(body.permissions).toEqual(['client:read']);
  });

  it('gives a client user only their own client', async () => {
    const body = (await me('clientAdminA').expect(200)).body as WorkspaceMeBody;
    expect(body.scope.clientId).toBe(clientA);
    expect(body.scope.clientId).not.toBe(clientB);
  });

  it('answers the super admin as an operator of the target workspace', async () => {
    const body = (await me('root').expect(200)).body as WorkspaceMeBody;

    expect(body.workspaceId).toBe(workspace);
    expect(body.scope).toEqual({ kind: 'operator', clientId: null, advertiserId: null });
  });

  it('refuses a workspace of another organization', async () => {
    await me('clientAdminA', otherWorkspace).expect(403);
    await me('opAdmin', otherWorkspace).expect(403);
  });

  it('requires authentication', async () => {
    await request(server).get(`/api/v1/workspaces/${workspace}/me`).expect(401);
  });
});
