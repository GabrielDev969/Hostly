import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { Writable } from 'stream';
import {
  startTestDatabase,
  stopTestDatabase,
  resetDatabase,
  getPrisma,
} from './helpers/test-database';
import { seedPermissions } from './helpers/seed-permissions';
import type { TestEmailDispatcher } from './helpers/test-email-dispatcher';
import { registerAndVerify } from './helpers/auth-flow';
import { createClient, provisionOperator } from './helpers/operator';
import { holdTransaction, inFlight, waitUntilBlockedBy } from './helpers/held-transaction';

describe('Invitations flow (e2e)', () => {
  let app: INestApplication;
  let server: App;
  let emailDispatcher: TestEmailDispatcher;
  // What the app logs (pino, at trace level), to prove the invitation token never reaches it.
  const logged: string[] = [];
  const logs = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      logged.push(chunk.toString('utf8'));
      callback();
    },
  });

  beforeAll(async () => {
    await startTestDatabase();

    const { createTestApp } = require('./helpers/test-app') as typeof import('./helpers/test-app');
    ({ app, emailDispatcher } = await createTestApp({ logs }));
    server = app.getHttpServer() as App;
  });

  afterAll(async () => {
    await app.close();
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedPermissions();
    emailDispatcher.reset();
  });

  async function registerAndLogin(email: string, name: string) {
    await registerAndVerify(server, emailDispatcher, {
      email,
      name,
      password: 'StrongPass@123',
    });

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: 'StrongPass@123' })
      .expect(200);

    return login.body.accessToken as string;
  }

  it('inviter sends → invitee accepts → invitee becomes member', async () => {
    const inviterToken = await registerAndLogin('inviter@example.com', 'Inviter');
    await provisionOperator(app, 'inviter@example.com');

    const wsList = await request(server)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${inviterToken}`)
      .expect(200);
    const workspaceId = wsList.body[0].id as string;

    const rolesRes = await request(server)
      .get('/api/v1/rbac/roles')
      .set('Authorization', `Bearer ${inviterToken}`)
      .set('x-workspace-id', workspaceId)
      .expect(200);
    const staffRole = rolesRes.body.find((r: { name: string }) => r.name === 'operator_staff') as {
      id: string;
    };
    expect(staffRole).toBeDefined();

    await request(server)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${inviterToken}`)
      .set('x-workspace-id', workspaceId)
      .send({ email: 'invitee@example.com', roleId: staffRole.id })
      .expect(201);
    const token = emailDispatcher.tokenFor('invitee@example.com');
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    const inviteeToken = await registerAndLogin('invitee@example.com', 'Invitee');

    const acceptRes = await request(server)
      .post('/api/v1/invitations/accept')
      .set('Authorization', `Bearer ${inviteeToken}`)
      .send({ token })
      .expect(200);
    expect(acceptRes.body.workspaceId).toBe(workspaceId);

    const inviteeWorkspaces = await request(server)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${inviteeToken}`)
      .expect(200);
    const ids = (inviteeWorkspaces.body as { id: string }[]).map((w) => w.id);
    expect(ids).toEqual([workspaceId]);
  });

  it('never hands out the token: not on create (replayed or not), list or revoke, nor in logs or audit', async () => {
    const inviterToken = await registerAndLogin('inviter@example.com', 'Inviter');
    const workspaceId = await provisionOperator(app, 'inviter@example.com');
    const asInviter = (req: request.Test) =>
      req.set('Authorization', `Bearer ${inviterToken}`).set('x-workspace-id', workspaceId);
    const rolesRes = await asInviter(request(server).get('/api/v1/rbac/roles')).expect(200);
    const roleId = (rolesRes.body as { id: string; name: string }[]).find(
      (r) => r.name === 'operator_staff',
    )!.id;
    const invite = () =>
      asInviter(request(server).post('/api/v1/invitations'))
        .set('Idempotency-Key', 'invite-invitee-1')
        .send({ email: 'invitee@example.com', roleId });

    const created = await invite().expect(201);
    const token = emailDispatcher.tokenFor('invitee@example.com');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(created.body).not.toHaveProperty('token');
    expect(created.text).not.toContain(token);

    // The idempotent replay serves the stored response, which never held the token either.
    const replayed = await invite().expect(201);
    expect(replayed.body).toEqual(created.body);
    expect(replayed.text).not.toContain(token);

    const list = await asInviter(request(server).get('/api/v1/invitations')).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).not.toHaveProperty('token');
    expect(list.text).not.toContain(token);

    const other = await asInviter(request(server).post('/api/v1/invitations'))
      .send({ email: 'other@example.com', roleId })
      .expect(201);
    const otherToken = emailDispatcher.tokenFor('other@example.com');
    expect(other.text).not.toContain(otherToken);
    const revoked = await asInviter(
      request(server).delete(`/api/v1/invitations/${other.body.id as string}`),
    ).expect(204);
    expect(revoked.text).toBe('');

    const audit = await getPrisma().auditLog.findMany({
      where: { action: { in: ['invitation.sent', 'invitation.revoked'] } },
    });
    expect(audit.map((row) => row.action).sort()).toEqual([
      'invitation.revoked',
      'invitation.sent',
      'invitation.sent',
    ]);
    for (const secret of [token, otherToken]) {
      expect(JSON.stringify(audit)).not.toContain(secret);
      expect(logged.join('')).not.toContain(secret);
    }

    // The token from the email is still what accepts the invitation.
    const inviteeToken = await registerAndLogin('invitee@example.com', 'Invitee');
    const accepted = await request(server)
      .post('/api/v1/invitations/accept')
      .set('Authorization', `Bearer ${inviteeToken}`)
      .send({ token })
      .expect(200);
    expect(accepted.body.workspaceId).toBe(workspaceId);
  });

  it('rejects accept when logged-in email does not match the invitation', async () => {
    const inviterToken = await registerAndLogin('inviter@example.com', 'Inviter');
    await provisionOperator(app, 'inviter@example.com');

    const wsList = await request(server)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${inviterToken}`);
    const workspaceId = wsList.body[0].id as string;
    const rolesRes = await request(server)
      .get('/api/v1/rbac/roles')
      .set('Authorization', `Bearer ${inviterToken}`)
      .set('x-workspace-id', workspaceId);
    const staffRole = rolesRes.body.find((r: { name: string }) => r.name === 'operator_staff') as {
      id: string;
    };

    await request(server)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${inviterToken}`)
      .set('x-workspace-id', workspaceId)
      .send({ email: 'invitee@example.com', roleId: staffRole.id })
      .expect(201);
    const token = emailDispatcher.tokenFor('invitee@example.com');

    const wrongUserToken = await registerAndLogin('wrong@example.com', 'Wrong User');

    await request(server)
      .post('/api/v1/invitations/accept')
      .set('Authorization', `Bearer ${wrongUserToken}`)
      .send({ token })
      .expect(403);
  });

  it('returns 409 when sending a duplicate pending invitation', async () => {
    const inviterToken = await registerAndLogin('inviter@example.com', 'Inviter');
    await provisionOperator(app, 'inviter@example.com');

    const wsList = await request(server)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${inviterToken}`);
    const workspaceId = wsList.body[0].id as string;
    const rolesRes = await request(server)
      .get('/api/v1/rbac/roles')
      .set('Authorization', `Bearer ${inviterToken}`)
      .set('x-workspace-id', workspaceId);
    const staffRole = rolesRes.body.find((r: { name: string }) => r.name === 'operator_staff') as {
      id: string;
    };

    await request(server)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${inviterToken}`)
      .set('x-workspace-id', workspaceId)
      .send({ email: 'invitee@example.com', roleId: staffRole.id })
      .expect(201);

    await request(server)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${inviterToken}`)
      .set('x-workspace-id', workspaceId)
      .send({ email: 'invitee@example.com', roleId: staffRole.id })
      .expect(409);
  });

  it('rejects inviting with a client-scoped role (400)', async () => {
    const inviterToken = await registerAndLogin('inviter@example.com', 'Inviter');
    const workspaceId = await provisionOperator(app, 'inviter@example.com');

    const rolesRes = await request(server)
      .get('/api/v1/rbac/roles')
      .set('Authorization', `Bearer ${inviterToken}`)
      .set('x-workspace-id', workspaceId)
      .expect(200);
    const clientAdminRole = rolesRes.body.find(
      (r: { name: string }) => r.name === 'client_admin',
    ) as {
      id: string;
    };
    expect(clientAdminRole).toBeDefined();

    const res = await request(server)
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${inviterToken}`)
      .set('x-workspace-id', workspaceId)
      .send({ email: 'invitee@example.com', roleId: clientAdminRole.id })
      .expect(400);
    expect(res.body.message).toMatch(/client_admin requires a client membership/);
  });

  describe('accepting revalidates what changed since the invitation was sent', () => {
    let clientId: string;
    let roleId: string;
    let invitationToken: string;
    let inviteeToken: string;

    const accept = () =>
      request(server)
        .post('/api/v1/invitations/accept')
        .set('Authorization', `Bearer ${inviteeToken}`)
        .send({ token: invitationToken });

    const memberships = async () =>
      getPrisma().workspaceMember.findMany({
        where: { user: { email: 'invitee@example.com' } },
      });

    beforeEach(async () => {
      const inviterToken = await registerAndLogin('inviter@example.com', 'Inviter');
      const workspaceId = await provisionOperator(app, 'inviter@example.com');
      const prisma = getPrisma();
      const { organizationId } = await prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
      });
      clientId = await createClient(organizationId, 'Shopping A', randomUUID());
      const role = await request(server)
        .post('/api/v1/rbac/roles')
        .set('Authorization', `Bearer ${inviterToken}`)
        .set('x-workspace-id', workspaceId)
        .send({ name: 'client-reader', permissionKeys: ['workspace:read'] })
        .expect(201);
      roleId = role.body.id as string;

      await request(server)
        .post('/api/v1/invitations')
        .set('Authorization', `Bearer ${inviterToken}`)
        .set('x-workspace-id', workspaceId)
        .send({ email: 'invitee@example.com', roleId, clientId })
        .expect(201);
      invitationToken = emailDispatcher.tokenFor('invitee@example.com');
      inviteeToken = await registerAndLogin('invitee@example.com', 'Invitee');
    });

    it('refuses a client deleted after the invitation was sent and creates no membership', async () => {
      await getPrisma().client.update({ where: { id: clientId }, data: { deletedAt: new Date() } });

      const res = await accept().expect(409);
      expect(res.body.message).toBe('The client of this invitation no longer exists');
      expect(await memberships()).toEqual([]);
      const invitation = await getPrisma().invitation.findFirstOrThrow({ where: { clientId } });
      expect(invitation.acceptedAt).toBeNull();
    });

    it('refuses a role that grew past the client ceiling and creates no membership', async () => {
      const prisma = getPrisma();
      const userRead = await prisma.permission.findFirstOrThrow({ where: { key: 'user:read' } });
      await prisma.rolePermission.create({ data: { roleId, permissionId: userRead.id } });

      await accept().expect(400);
      expect(await memberships()).toEqual([]);
    });

    it('accepts into a paused client', async () => {
      await getPrisma().client.update({ where: { id: clientId }, data: { status: 'paused' } });

      await accept().expect(200);
      expect((await memberships()).map((m) => m.clientId)).toEqual([clientId]);
    });

    it('accepts only once', async () => {
      await accept().expect(200);
      await accept().expect(400);
      expect(await memberships()).toHaveLength(1);
    });
  });

  // Accepting locks the invitation, then the role (the membership's foreign key); deleting a role
  // deletes its invitations before the role, in that same order, so no race deadlocks into a 500.
  describe('racing a role delete', () => {
    let inviterToken: string;
    let workspaceId: string;
    let roleId: string;
    let invitationId: string;
    let invitationToken: string;
    let inviteeToken: string;

    const asInviter = (req: request.Test) =>
      req.set('Authorization', `Bearer ${inviterToken}`).set('x-workspace-id', workspaceId);
    const deleteRole = () => asInviter(request(server).delete(`/api/v1/rbac/roles/${roleId}`));
    const state = async () => {
      const prisma = getPrisma();
      return {
        role: await prisma.role.count({ where: { id: roleId } }),
        invitations: await prisma.invitation.findMany({
          where: { roleId },
          select: { email: true, acceptedAt: true },
          orderBy: { email: 'asc' },
        }),
        members: await prisma.workspaceMember.count({ where: { roleId } }),
      };
    };
    // A 409 from a foreign key names no row, no role and no workspace, not even in the stack sent
    // outside production; only the path, the caller's own URL, carries the role id.
    const expectBareConflict = (res: request.Response) => {
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Foreign key constraint violated');
      const body = JSON.stringify({ ...res.body, path: undefined });
      expect(body).not.toContain(roleId);
      expect(body).not.toContain(workspaceId);
    };
    // What accepting does, up to the membership: close the invitation first.
    const acceptLock = () =>
      holdTransaction((tx) =>
        tx.invitation.updateMany({ where: { id: invitationId }, data: { acceptedAt: new Date() } }),
      );
    // What deleting the role does: its invitations, then the role.
    const deleteLock = () =>
      holdTransaction(async (tx) => {
        await tx.invitation.deleteMany({ where: { roleId, workspaceId } });
        await tx.role.delete({ where: { id: roleId, workspaceId } });
      });

    beforeEach(async () => {
      inviterToken = await registerAndLogin('inviter@example.com', 'Inviter');
      workspaceId = await provisionOperator(app, 'inviter@example.com');
      const role = await asInviter(request(server).post('/api/v1/rbac/roles'))
        .send({ name: 'race-role', permissionKeys: ['workspace:read'] })
        .expect(201);
      roleId = role.body.id as string;
      const invitation = await asInviter(request(server).post('/api/v1/invitations'))
        .send({ email: 'invitee@example.com', roleId })
        .expect(201);
      invitationId = invitation.body.id as string;
      invitationToken = emailDispatcher.tokenFor('invitee@example.com');
      inviteeToken = await registerAndLogin('invitee@example.com', 'Invitee');
    });

    it('makes the delete wait for an invitation being accepted, then refuses it', async () => {
      const invitee = await getPrisma().user.findUniqueOrThrow({
        where: { email: 'invitee@example.com' },
      });
      const accepting = await acceptLock();
      try {
        const deleting = inFlight(deleteRole());
        await waitUntilBlockedBy(accepting.pid);
        // With the role locked first (a plain cascade), this insert would deadlock with the delete.
        await accepting.run((tx) =>
          tx.workspaceMember.create({ data: { userId: invitee.id, workspaceId, roleId } }),
        );
        expect(deleting.answered()).toBe(false);

        await accepting.commit();
        expectBareConflict(await deleting.response);
        expect(await state()).toEqual({
          role: 1,
          invitations: [{ email: 'invitee@example.com', acceptedAt: expect.any(Date) }],
          members: 1,
        });
      } finally {
        await accepting.rollback();
      }
    });

    it('lets the delete through, invitations and all, when the accept rolls back', async () => {
      const accepting = await acceptLock();
      try {
        const deleting = inFlight(deleteRole());
        await waitUntilBlockedBy(accepting.pid);

        await accepting.rollback();
        expect((await deleting.response).status).toBe(204);
        expect(await state()).toEqual({ role: 0, invitations: [], members: 0 });
      } finally {
        await accepting.rollback();
      }
    });

    it('turns an accept that loses to the delete into "no longer pending"', async () => {
      const deleting = await deleteLock();
      try {
        const accepting = inFlight(
          request(server)
            .post('/api/v1/invitations/accept')
            .set('Authorization', `Bearer ${inviteeToken}`)
            .send({ token: invitationToken }),
        );
        await waitUntilBlockedBy(deleting.pid);
        expect(accepting.answered()).toBe(false);

        await deleting.commit();
        const res = await accepting.response;
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Invitation is no longer pending');
        expect(await state()).toEqual({ role: 0, invitations: [], members: 0 });
      } finally {
        await deleting.rollback();
      }
    });

    it('makes the delete wait for an invitation being sent, then refuses it', async () => {
      const inviter = await getPrisma().user.findUniqueOrThrow({
        where: { email: 'inviter@example.com' },
      });
      // What sending does: insert the invitation, which holds the role through its foreign key.
      const sending = await holdTransaction((tx) =>
        tx.invitation.create({
          data: {
            email: 'late@example.com',
            workspaceId,
            roleId,
            invitedById: inviter.id,
            tokenHash: randomUUID(),
            expiresAt: new Date(Date.now() + 60_000),
          },
        }),
      );
      try {
        const deleting = inFlight(deleteRole());
        await waitUntilBlockedBy(sending.pid);
        expect(deleting.answered()).toBe(false);

        await sending.commit();
        expectBareConflict(await deleting.response);
        expect(await state()).toEqual({
          role: 1,
          invitations: [
            { email: 'invitee@example.com', acceptedAt: null },
            { email: 'late@example.com', acceptedAt: null },
          ],
          members: 0,
        });
      } finally {
        await sending.rollback();
      }
    });

    it('makes an invitation being sent wait for the delete, then refuses it', async () => {
      const deleting = await deleteLock();
      try {
        const sending = inFlight(
          asInviter(request(server).post('/api/v1/invitations')).send({
            email: 'late@example.com',
            roleId,
          }),
        );
        await waitUntilBlockedBy(deleting.pid);
        expect(sending.answered()).toBe(false);

        await deleting.commit();
        expectBareConflict(await sending.response);
        expect(await state()).toEqual({ role: 0, invitations: [], members: 0 });
      } finally {
        await deleting.rollback();
      }
    });
  });
});
