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
import { addScopedMember, provisionOperator } from './helpers/operator';
import { holdTransaction, inFlight, waitUntilBlockedBy } from './helpers/held-transaction';

const PASSWORD = 'StrongPass@123';

const USERS = {
  opAdminX: 'op-admin-x@example.com',
  opStaffX: 'op-staff-x@example.com',
  clientAdminA: 'client-admin-a@example.com',
  clientEditorA: 'client-editor-a@example.com',
  clientAdminB: 'client-admin-b@example.com',
  advertiserA: 'advertiser-a@example.com',
  opAdminY: 'op-admin-y@example.com',
} as const;

type UserKey = keyof typeof USERS;

interface ClientBody {
  id: string;
  name: string;
  status: string;
  isInternal: boolean;
}

interface SiteBody {
  id: string;
  clientId: string;
  name: string;
  timezone: string;
  address: string | null;
}

describe('Clients and sites (e2e)', () => {
  let app: INestApplication;
  let server: App;
  let emailDispatcher: TestEmailDispatcher;
  const tokens = {} as Record<UserKey, string>;
  let workspaceX: string;
  let workspaceY: string;
  let organizationX: string;
  let clientA: string;
  let clientB: string;
  let siteA: string;
  let siteB: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken as string;
  };

  const as = (user: UserKey, workspaceId = workspaceX) => ({
    get: (path: string) =>
      request(server)
        .get(path)
        .set('Authorization', `Bearer ${tokens[user]}`)
        .set('x-workspace-id', workspaceId),
    post: (path: string, body: object) =>
      request(server)
        .post(path)
        .set('Authorization', `Bearer ${tokens[user]}`)
        .set('x-workspace-id', workspaceId)
        .send(body),
    patch: (path: string, body: object) =>
      request(server)
        .patch(path)
        .set('Authorization', `Bearer ${tokens[user]}`)
        .set('x-workspace-id', workspaceId)
        .send(body),
    delete: (path: string) =>
      request(server)
        .delete(path)
        .set('Authorization', `Bearer ${tokens[user]}`)
        .set('x-workspace-id', workspaceId),
  });

  const createClient = async (name: string): Promise<string> =>
    ((await as('opAdminX').post('/api/v1/clients', { name }).expect(201)).body as ClientBody).id;

  const createSite = async (clientId: string, name: string): Promise<string> =>
    (
      (
        await as('opAdminX')
          .post('/api/v1/sites', { clientId, name, timezone: 'America/Sao_Paulo' })
          .expect(201)
      ).body as SiteBody
    ).id;

  const roleId = async (name: string): Promise<string> =>
    (
      await getPrisma().role.findUniqueOrThrow({
        where: { workspaceId_name: { workspaceId: workspaceX, name } },
      })
    ).id;

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
    workspaceX = await provisionOperator(app, USERS.opAdminX, { name: 'Operator X' });
    workspaceY = await provisionOperator(app, USERS.opAdminY, { name: 'Operator Y' });
    organizationX = (await getPrisma().workspace.findUniqueOrThrow({ where: { id: workspaceX } }))
      .organizationId;
    for (const key of Object.keys(USERS) as UserKey[]) tokens[key] = await login(USERS[key]);

    clientA = await createClient('Shopping A');
    clientB = await createClient('Shopping B');
    siteA = await createSite(clientA, 'A - Piso L1');
    siteB = await createSite(clientB, 'B - Piso L1');

    await addScopedMember(workspaceX, USERS.opStaffX, 'operator_staff', {
      clientId: null,
      advertiserId: null,
    });
    const inA = { clientId: clientA, advertiserId: null };
    await addScopedMember(workspaceX, USERS.clientAdminA, 'client_admin', inA);
    await addScopedMember(workspaceX, USERS.clientEditorA, 'client_editor', inA);
    await addScopedMember(workspaceX, USERS.clientAdminB, 'client_admin', {
      clientId: clientB,
      advertiserId: null,
    });
    await addScopedMember(workspaceX, USERS.advertiserA, 'advertiser', {
      clientId: clientA,
      advertiserId: 'adv-1',
    });
  });

  afterAll(async () => {
    await app.close();
    await stopTestDatabase();
  });

  describe('operator admin', () => {
    it('runs the client and site CRUD and audits every write', async () => {
      const created = await as('opAdminX').post('/api/v1/clients', { name: '  Shopping C ' });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        name: 'Shopping C',
        status: 'onboarding',
        isInternal: false,
      });
      const id = (created.body as ClientBody).id;

      await as('opAdminX').get(`/api/v1/clients/${id}`).expect(200);
      const updated = await as('opAdminX')
        .patch(`/api/v1/clients/${id}`, { name: 'Shopping C+', status: 'active' })
        .expect(200);
      expect(updated.body).toMatchObject({ name: 'Shopping C+', status: 'active' });

      const site = await as('opAdminX')
        .post('/api/v1/sites', {
          clientId: id,
          name: 'Piso L2',
          timezone: 'america/sao_paulo',
          address: 'Av. Paulista, 1000',
        })
        .expect(201);
      expect(site.body).toMatchObject({
        clientId: id,
        name: 'Piso L2',
        timezone: 'America/Sao_Paulo',
        address: 'Av. Paulista, 1000',
      });
      const siteId = (site.body as SiteBody).id;
      const movedZone = await as('opAdminX')
        .patch(`/api/v1/sites/${siteId}`, { timezone: 'America/Manaus', address: null })
        .expect(200);
      expect(movedZone.body).toMatchObject({ timezone: 'America/Manaus', address: null });

      await as('opAdminX').delete(`/api/v1/sites/${siteId}`).expect(204);
      await as('opAdminX').get(`/api/v1/sites/${siteId}`).expect(404);
      await as('opAdminX').delete(`/api/v1/clients/${id}`).expect(204);
      await as('opAdminX').get(`/api/v1/clients/${id}`).expect(404);

      const logs = await getPrisma().auditLog.findMany({
        where: { resourceId: { in: [id, siteId] } },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.map((l) => l.action)).toEqual([
        'client.created',
        'client.updated',
        'site.created',
        'site.updated',
        'site.deleted',
        'client.deleted',
      ]);
      expect(logs.every((l) => l.organizationId === organizationX)).toBe(true);
    });

    it('rejects an invalid or missing time zone', async () => {
      for (const timezone of ['Mars/Olympus', '+03:00', 'EST', '', undefined]) {
        await as('opAdminX')
          .post('/api/v1/sites', { clientId: clientA, name: 'Piso X', timezone })
          .expect(400);
      }
      await as('opAdminX').patch(`/api/v1/sites/${siteA}`, { timezone: null }).expect(400);
      await as('opAdminX').patch(`/api/v1/clients/${clientA}`, { name: null }).expect(400);
    });
  });

  describe('scope', () => {
    it('operator staff reads every client and site of the organization but writes none', async () => {
      const clients = (await as('opStaffX').get('/api/v1/clients').expect(200))
        .body as ClientBody[];
      expect(clients.map((c) => c.id)).toEqual(expect.arrayContaining([clientA, clientB]));
      const sites = (await as('opStaffX').get('/api/v1/sites').expect(200)).body as SiteBody[];
      expect(sites.map((s) => s.id)).toEqual(expect.arrayContaining([siteA, siteB]));

      await as('opStaffX').post('/api/v1/clients', { name: 'Nope' }).expect(403);
      await as('opStaffX').patch(`/api/v1/clients/${clientA}`, { name: 'Nope' }).expect(403);
      await as('opStaffX').delete(`/api/v1/clients/${clientA}`).expect(403);
      await as('opStaffX')
        .post('/api/v1/sites', { clientId: clientA, name: 'Nope', timezone: 'UTC' })
        .expect(403);
      await as('opStaffX').patch(`/api/v1/sites/${siteA}`, { name: 'Nope' }).expect(403);
      await as('opStaffX').delete(`/api/v1/sites/${siteA}`).expect(403);
    });

    it.each(['clientAdminA', 'clientEditorA'] as const)(
      '%s sees only client A and its sites, and writes nothing',
      async (user) => {
        const clients = (await as(user).get('/api/v1/clients').expect(200)).body as ClientBody[];
        expect(clients.map((c) => c.id)).toEqual([clientA]);
        await as(user).get(`/api/v1/clients/${clientA}`).expect(200);
        await as(user).get(`/api/v1/clients/${clientB}`).expect(404);

        const sites = (await as(user).get('/api/v1/sites').expect(200)).body as SiteBody[];
        expect(sites.map((s) => s.id)).toEqual([siteA]);
        await as(user).get(`/api/v1/sites/${siteB}`).expect(404);
        expect((await as(user).get(`/api/v1/sites?clientId=${clientB}`).expect(200)).body).toEqual(
          [],
        );

        await as(user).post('/api/v1/clients', { name: 'Nope' }).expect(403);
        await as(user).patch(`/api/v1/clients/${clientA}`, { name: 'Nope' }).expect(403);
        await as(user).delete(`/api/v1/clients/${clientA}`).expect(403);
        await as(user)
          .post('/api/v1/sites', { clientId: clientA, name: 'Nope', timezone: 'UTC' })
          .expect(403);
        await as(user).patch(`/api/v1/sites/${siteA}`, { name: 'Nope' }).expect(403);
        await as(user).delete(`/api/v1/sites/${siteA}`).expect(403);
      },
    );

    it('client B admin does not see client A', async () => {
      const clients = (await as('clientAdminB').get('/api/v1/clients').expect(200))
        .body as ClientBody[];
      expect(clients.map((c) => c.id)).toEqual([clientB]);
      await as('clientAdminB').get(`/api/v1/sites/${siteA}`).expect(404);
    });

    it('keeps advertisers out of clients and sites', async () => {
      await as('advertiserA').get('/api/v1/clients').expect(403);
      await as('advertiserA').get(`/api/v1/clients/${clientA}`).expect(403);
      await as('advertiserA').get('/api/v1/sites').expect(403);
    });

    it("another organization's operator sees nothing of this one", async () => {
      const y = as('opAdminY', workspaceY);
      const clients = (await y.get('/api/v1/clients').expect(200)).body as ClientBody[];
      expect(clients).toEqual([expect.objectContaining({ isInternal: true })]);
      expect((await y.get('/api/v1/sites').expect(200)).body).toEqual([]);

      await y.get(`/api/v1/clients/${clientA}`).expect(404);
      await y.get(`/api/v1/sites/${siteA}`).expect(404);
      await y.patch(`/api/v1/clients/${clientA}`, { name: 'Hijacked' }).expect(404);
      await y.delete(`/api/v1/sites/${siteA}`).expect(404);
      await y
        .post('/api/v1/sites', { clientId: clientA, name: 'Foreign', timezone: 'UTC' })
        .expect(404);
    });
  });

  describe('internal client', () => {
    const internalOf = async (user: UserKey, workspaceId?: string): Promise<ClientBody[]> =>
      (
        (await as(user, workspaceId).get('/api/v1/clients').expect(200)).body as ClientBody[]
      ).filter((c) => c.isInternal);

    it('is born with the organization, active, one per organization', async () => {
      const internal = await internalOf('opAdminX');
      expect(internal).toEqual([
        expect.objectContaining({ name: 'Operator X robots', status: 'active' }),
      ]);
      expect(await internalOf('opAdminY', workspaceY)).toHaveLength(1);
      await expect(
        getPrisma().client.create({
          data: {
            organizationId: organizationX,
            name: 'Second',
            isInternal: true,
            status: 'active',
          },
        }),
      ).rejects.toThrow();
    });

    it('can be renamed but never paused nor deleted', async () => {
      const [internal] = await internalOf('opAdminX');
      const path = `/api/v1/clients/${internal!.id}`;

      await as('opAdminX').patch(path, { status: 'paused' }).expect(400);
      await as('opAdminX').patch(path, { status: 'onboarding' }).expect(400);
      await as('opAdminX').delete(path).expect(409);
      await as('opAdminX').patch(path, { name: 'Operator X fleet' }).expect(200);
      await as('opAdminX').patch(path, { name: 'Operator X robots' }).expect(200);
    });
  });

  describe('deleting a client', () => {
    it('is blocked while it has members', async () => {
      await as('opAdminX').delete(`/api/v1/clients/${clientB}`).expect(409);
    });

    it('is blocked while it has sites', async () => {
      const id = await createClient('Shopping D');
      const site = await createSite(id, 'D - Piso L1');

      await as('opAdminX').delete(`/api/v1/clients/${id}`).expect(409);
      await as('opAdminX').delete(`/api/v1/sites/${site}`).expect(204);
      await as('opAdminX').delete(`/api/v1/clients/${id}`).expect(204);
    });

    it('is blocked while it has a pending invitation', async () => {
      const id = await createClient('Shopping E');
      const invite = await as('opAdminX')
        .post('/api/v1/invitations', {
          email: 'pending-e@example.com',
          roleId: await roleId('client_editor'),
          clientId: id,
        })
        .expect(201);

      await as('opAdminX').delete(`/api/v1/clients/${id}`).expect(409);
      await as('opAdminX')
        .delete(`/api/v1/invitations/${invite.body.id as string}`)
        .expect(204);
      await as('opAdminX').delete(`/api/v1/clients/${id}`).expect(204);
    });
  });

  describe('invitations with a client', () => {
    it('puts the accepted member in the client, with the new scope at once', async () => {
      const id = await createClient('Shopping F');
      const email = 'newcomer-f@example.com';
      await registerAndVerify(server, emailDispatcher, { email, name: email, password: PASSWORD });
      const newcomer = await login(email);
      const asNewcomer = () =>
        request(server)
          .get('/api/v1/clients')
          .set('Authorization', `Bearer ${newcomer}`)
          .set('x-workspace-id', workspaceX);
      // Primes the membership cache with "not a member" before accepting.
      await asNewcomer().expect(403);

      const invite = await as('opAdminX')
        .post('/api/v1/invitations', {
          email,
          roleId: await roleId('client_editor'),
          clientId: id,
        })
        .expect(201);
      expect(invite.body).toMatchObject({ clientId: id });

      await request(server)
        .post('/api/v1/invitations/accept')
        .set('Authorization', `Bearer ${newcomer}`)
        .send({ token: invite.body.token as string })
        .expect(200);

      const membership = await getPrisma().workspaceMember.findFirstOrThrow({
        where: { workspaceId: workspaceX, user: { email } },
      });
      expect(membership).toMatchObject({ clientId: id, advertiserId: null });
      const clients = (await asNewcomer().expect(200)).body as ClientBody[];
      expect(clients.map((c) => c.id)).toEqual([id]);
    });

    it('refuses a client of another organization or a deleted one', async () => {
      const y = (
        (await as('opAdminY', workspaceY).get('/api/v1/clients').expect(200)).body as ClientBody[]
      )[0]!;
      const clientEditor = await roleId('client_editor');
      await as('opAdminX')
        .post('/api/v1/invitations', {
          email: 'x@example.com',
          roleId: clientEditor,
          clientId: y.id,
        })
        .expect(404);

      const gone = await createClient('Shopping G');
      await as('opAdminX').delete(`/api/v1/clients/${gone}`).expect(204);
      await as('opAdminX')
        .post('/api/v1/invitations', {
          email: 'x@example.com',
          roleId: clientEditor,
          clientId: gone,
        })
        .expect(404);
    });

    it('requires a client for client roles and refuses one for operator roles', async () => {
      await as('opAdminX')
        .post('/api/v1/invitations', {
          email: 'x@example.com',
          roleId: await roleId('client_admin'),
        })
        .expect(400);
      await as('opAdminX')
        .post('/api/v1/invitations', {
          email: 'x@example.com',
          roleId: await roleId('operator_staff'),
          clientId: clientA,
        })
        .expect(400);
    });

    it('lets only the operator invite', async () => {
      await as('clientAdminA')
        .post('/api/v1/invitations', {
          email: 'x@example.com',
          roleId: await roleId('client_editor'),
          clientId: clientA,
        })
        .expect(403);
      await as('clientAdminA').get('/api/v1/invitations').expect(403);
    });
  });

  // A transaction held open by the test stands in for the other request, so each run takes the
  // same interleaving: the request is proven to wait on that transaction's lock, then answers.
  describe('racing a client delete', () => {
    const markDeleted = (id: string) =>
      holdTransaction((tx) => tx.client.update({ where: { id }, data: { deletedAt: new Date() } }));

    it('makes a new site wait for the delete, then refuses it', async () => {
      const id = await createClient('Shopping R1');
      const deleting = await markDeleted(id);
      try {
        const creating = inFlight(
          as('opAdminX').post('/api/v1/sites', {
            clientId: id,
            name: 'R1 - Piso L1',
            timezone: 'America/Sao_Paulo',
          }),
        );
        await waitUntilBlockedBy(deleting.pid);
        expect(creating.answered()).toBe(false);

        await deleting.commit();
        const res = await creating.response;
        expect(res.status).toBe(404);
        expect(res.body.message).toBe('Client not found');
        expect(await getPrisma().site.count({ where: { clientId: id } })).toBe(0);
      } finally {
        await deleting.rollback();
      }
    });

    it('makes the delete wait for a site being created, then counts it', async () => {
      const id = await createClient('Shopping R2');
      // What creating a site does: lock the client, then insert under it.
      const creating = await holdTransaction(async (tx) => {
        await tx.client.updateMany({
          where: { id, deletedAt: null },
          data: { updatedAt: new Date() },
        });
        await tx.site.create({
          data: {
            organizationId: organizationX,
            clientId: id,
            name: 'R2 - Piso L1',
            timezone: 'America/Sao_Paulo',
          },
        });
      });
      try {
        const deleting = inFlight(as('opAdminX').delete(`/api/v1/clients/${id}`));
        await waitUntilBlockedBy(creating.pid);
        expect(deleting.answered()).toBe(false);

        await creating.commit();
        const res = await deleting.response;
        expect(res.status).toBe(409);
        expect(res.body.message).toBe('Client still has sites; remove them first');
        const client = await getPrisma().client.findUniqueOrThrow({ where: { id } });
        expect(client.deletedAt).toBeNull();
      } finally {
        await creating.rollback();
      }
    });

    it('makes an invitation wait for the delete, then refuses it without an email', async () => {
      const id = await createClient('Shopping R3');
      const email = 'race-r3@example.com';
      const clientEditor = await roleId('client_editor');
      const deleting = await markDeleted(id);
      try {
        const inviting = inFlight(
          as('opAdminX').post('/api/v1/invitations', { email, roleId: clientEditor, clientId: id }),
        );
        await waitUntilBlockedBy(deleting.pid);
        expect(inviting.answered()).toBe(false);

        await deleting.commit();
        const res = await inviting.response;
        expect(res.status).toBe(404);
        expect(res.body.message).toBe('Client not found');
        expect(await getPrisma().invitation.count({ where: { clientId: id } })).toBe(0);
        expect(emailDispatcher.lastFor(email)).toBeUndefined();
      } finally {
        await deleting.rollback();
      }
    });
  });
});
