import { ForbiddenException } from '@nestjs/common';
import { TenantScopeError, TenantScopeRewriter } from './tenant-scope.rewriter';
import type { TenantScope } from './tenant-scope';

const operator: TenantScope = {
  organizationId: 'org1',
  workspaceId: 'w1',
  clientId: null,
  advertiserId: null,
};
const client: TenantScope = { ...operator, clientId: 'client-a' };
const advertiser: TenantScope = { ...client, advertiserId: 'adv-1' };

const memberScope = (scope: TenantScope) => ({
  workspace: { organizationId: scope.organizationId },
  ...(scope.clientId ? { clientId: scope.clientId } : {}),
  ...(scope.advertiserId ? { advertiserId: scope.advertiserId } : {}),
});

describe('TenantScopeRewriter', () => {
  describe('top-level operations on scoped models', () => {
    it.each([
      'findMany',
      'findFirst',
      'findFirstOrThrow',
      'count',
      'aggregate',
      'groupBy',
      'updateMany',
      'deleteMany',
    ])('adds the scope filter to %s', (operation) => {
      const out = new TenantScopeRewriter(client).rewrite('WorkspaceMember', operation, {
        where: { roleId: 'r1' },
      });
      expect(out.where).toEqual({ roleId: 'r1', AND: [memberScope(client)] });
    });

    it('keeps unique keys at the top level of findUnique, update and delete', () => {
      for (const operation of ['findUnique', 'update', 'delete']) {
        const out = new TenantScopeRewriter(advertiser).rewrite('WorkspaceMember', operation, {
          where: { id: 'm1' },
          data: operation === 'update' ? { roleId: 'r2' } : undefined,
        });
        expect(out.where).toEqual({ id: 'm1', AND: [memberScope(advertiser)] });
      }
    });

    it('scopes a query without where', () => {
      const out = new TenantScopeRewriter(operator).rewrite('AuditLog', 'count', {});
      expect(out.where).toEqual({ organizationId: 'org1' });
    });

    it('appends to an existing AND instead of replacing it', () => {
      const out = new TenantScopeRewriter(client).rewrite('AuditLog', 'findMany', {
        where: { AND: [{ action: 'a' }] },
      });
      expect(out.where).toEqual({
        AND: [{ action: 'a' }, { organizationId: 'org1', clientId: 'client-a' }],
      });
    });

    it('refuses scoped models without a scope (default deny)', () => {
      expect(() =>
        new TenantScopeRewriter(null).rewrite('WorkspaceMember', 'findMany', {}),
      ).toThrow(TenantScopeError);
    });

    it('forbids advertisers from models without an advertiser dimension', () => {
      expect(() => new TenantScopeRewriter(advertiser).rewrite('AuditLog', 'findMany', {})).toThrow(
        ForbiddenException,
      );
    });

    it('leaves models outside the registry untouched', () => {
      const args = { where: { email: 'a@b.c' } };
      expect(new TenantScopeRewriter(null).rewrite('User', 'findFirst', args)).toEqual(args);
    });
  });

  describe('tenant roots', () => {
    it('limits Organization and Workspace to the own tenant, for every scope kind', () => {
      for (const scope of [operator, client, advertiser]) {
        const rewriter = new TenantScopeRewriter(scope);
        expect(rewriter.rewrite('Organization', 'findMany', {}).where).toEqual({ id: 'org1' });
        expect(rewriter.rewrite('Workspace', 'findFirst', { where: { slug: 's' } }).where).toEqual({
          slug: 's',
          AND: [{ organizationId: 'org1' }],
        });
      }
    });

    it.each([
      ['Organization', 'update', { where: { id: 'org1' }, data: { ownerId: 'u2' } }],
      ['Organization', 'updateMany', { where: {}, data: { name: 'Mine' } }],
      ['Workspace', 'update', { where: { id: 'w1' }, data: { name: 'Mine' } }],
      ['Workspace', 'updateManyAndReturn', { where: {}, data: { name: 'Mine' } }],
      ['Workspace', 'upsert', { where: { id: 'w1' }, create: {}, update: { name: 'Mine' } }],
      ['Workspace', 'delete', { where: { id: 'w1' } }],
      ['Organization', 'deleteMany', { where: {} }],
    ])('lets only operators change a tenant root: %s.%s', (model, operation, args) => {
      for (const scope of [client, advertiser]) {
        expect(() => new TenantScopeRewriter(scope).rewrite(model, operation, args)).toThrow(
          ForbiddenException,
        );
      }
    });

    it('still lets operators update their own root', () => {
      const out = new TenantScopeRewriter(operator).rewrite('Organization', 'update', {
        where: { id: 'org1' },
        data: { name: 'Renamed' },
      });
      expect(out.where).toEqual({ id: 'org1', AND: [{ id: 'org1' }] });
    });

    it('refuses to create a tenant through the scoped client', () => {
      expect(() =>
        new TenantScopeRewriter(operator).rewrite('Organization', 'create', {
          data: { name: 'Other', slug: 'other', ownerId: 'u1' },
        }),
      ).toThrow(TenantScopeError);
    });
  });

  describe('deletes', () => {
    it.each([
      ['User', 'delete'],
      ['Role', 'deleteMany'],
      ['Workspace', 'delete'],
      ['Organization', 'deleteMany'],
    ])('refuses %s.%s because it cascades into scoped rows', (model, operation) => {
      expect(() =>
        new TenantScopeRewriter(operator).rewrite(model, operation, { where: { id: 'x' } }),
      ).toThrow(TenantScopeError);
    });

    it('still deletes scoped leaf rows inside the scope', () => {
      const out = new TenantScopeRewriter(client).rewrite('WorkspaceMember', 'delete', {
        where: { id: 'm1' },
      });
      expect(out.where).toEqual({ id: 'm1', AND: [memberScope(client)] });
    });
  });

  describe('relations loaded through include/select', () => {
    it('filters a list relation into a scoped model from an unscoped model', () => {
      const out = new TenantScopeRewriter(client).rewrite('Workspace', 'findUnique', {
        where: { id: 'w1' },
        include: { members: true },
      });
      expect(out.include).toEqual({ members: { where: memberScope(client) } });
    });

    it('keeps the caller filter and recurses into nested includes', () => {
      const out = new TenantScopeRewriter(client).rewrite('User', 'findMany', {
        select: {
          id: true,
          memberships: { where: { roleId: 'r1' }, include: { role: true } },
          ownedOrganizations: { include: { workspaces: { include: { members: true } } } },
        },
      });
      expect(out.select).toEqual({
        id: true,
        memberships: {
          where: { roleId: 'r1', AND: [memberScope(client)] },
          include: { role: true },
        },
        ownedOrganizations: {
          where: { id: 'org1' },
          include: {
            workspaces: {
              where: { organizationId: 'org1' },
              include: { members: { where: memberScope(client) } },
            },
          },
        },
      });
    });

    it('filters _count of scoped relations and rejects _count: true', () => {
      const out = new TenantScopeRewriter(client).rewrite('Workspace', 'findMany', {
        include: { _count: { select: { members: true, roles: true } } },
      });
      expect(out.include).toEqual({
        _count: { select: { members: { where: memberScope(client) }, roles: true } },
      });
      expect(() =>
        new TenantScopeRewriter(client).rewrite('Workspace', 'findMany', {
          include: { _count: true },
        }),
      ).toThrow(TenantScopeError);
    });

    it('rejects relations into scoped models when there is no scope', () => {
      expect(() =>
        new TenantScopeRewriter(null).rewrite('Workspace', 'findUnique', {
          where: { id: 'w1' },
          include: { members: true },
        }),
      ).toThrow(TenantScopeError);
    });

    it('rejects ordering by a scoped relation', () => {
      expect(() =>
        new TenantScopeRewriter(operator).rewrite('Workspace', 'findMany', {
          orderBy: { members: { _count: 'desc' } },
        }),
      ).toThrow(TenantScopeError);
    });
  });

  describe('relation filters in where', () => {
    it('scopes some/none and keeps out-of-scope rows from failing every', () => {
      const out = new TenantScopeRewriter(client).rewrite('User', 'findMany', {
        where: {
          memberships: { some: { roleId: 'r1' } },
          OR: [{ auditLogs: { none: { action: 'x' } } }, { auditLogs: { every: { action: 'y' } } }],
        },
      });
      const audit = { organizationId: 'org1', clientId: 'client-a' };
      expect(out.where).toEqual({
        memberships: { some: { roleId: 'r1', AND: [memberScope(client)] } },
        OR: [
          { auditLogs: { none: { action: 'x', AND: [audit] } } },
          { auditLogs: { every: { OR: [{ action: 'y' }, { NOT: audit }] } } },
        ],
      });
    });
  });

  describe('writes', () => {
    it('stamps the scope on create and rejects another scope', () => {
      const out = new TenantScopeRewriter(client).rewrite('AuditLog', 'create', {
        data: { action: 'a', hash: 'h' },
      });
      expect(out.data).toEqual({
        action: 'a',
        hash: 'h',
        organizationId: 'org1',
        clientId: 'client-a',
      });
      expect(() =>
        new TenantScopeRewriter(client).rewrite('AuditLog', 'create', {
          data: { action: 'a', hash: 'h', clientId: 'client-b' },
        }),
      ).toThrow(ForbiddenException);
    });

    it('stamps every row of createMany', () => {
      const out = new TenantScopeRewriter(client).rewrite('WorkspaceMember', 'createMany', {
        data: [
          { userId: 'u1', roleId: 'r1' },
          { userId: 'u2', roleId: 'r1' },
        ],
      });
      expect(out.data).toEqual([
        { userId: 'u1', roleId: 'r1', workspaceId: 'w1', clientId: 'client-a' },
        { userId: 'u2', roleId: 'r1', workspaceId: 'w1', clientId: 'client-a' },
      ]);
    });

    it('lets operators assign any client but never another workspace', () => {
      const out = new TenantScopeRewriter(operator).rewrite('WorkspaceMember', 'create', {
        data: { userId: 'u1', roleId: 'r1', clientId: 'client-b' },
      });
      expect(out.data).toMatchObject({ workspaceId: 'w1', clientId: 'client-b' });
      expect(() =>
        new TenantScopeRewriter(operator).rewrite('WorkspaceMember', 'create', {
          data: { userId: 'u1', roleId: 'r1', workspaceId: 'w2' },
        }),
      ).toThrow(ForbiddenException);
    });

    it('rejects updates that move a row out of the scope', () => {
      expect(() =>
        new TenantScopeRewriter(client).rewrite('WorkspaceMember', 'updateMany', {
          where: {},
          data: { clientId: { set: 'client-b' } },
        }),
      ).toThrow(ForbiddenException);
    });

    it('checks both branches of upsert', () => {
      const out = new TenantScopeRewriter(client).rewrite('AuditLog', 'upsert', {
        where: { id: 'l1' },
        create: { action: 'a', hash: 'h' },
        update: { action: 'b' },
      });
      expect(out.create).toMatchObject({ organizationId: 'org1', clientId: 'client-a' });
      expect(out.where).toEqual({
        id: 'l1',
        AND: [{ organizationId: 'org1', clientId: 'client-a' }],
      });
    });

    it('rejects nested writes into scoped models from any model', () => {
      expect(() =>
        new TenantScopeRewriter(operator).rewrite('Workspace', 'update', {
          where: { id: 'w1' },
          data: { members: { create: { userId: 'u1', roleId: 'r1' } } },
        }),
      ).toThrow(TenantScopeError);
      expect(() =>
        new TenantScopeRewriter(operator).rewrite('WorkspaceMember', 'create', {
          data: { userId: 'u1', role: { connect: { id: 'r1' } } },
        }),
      ).toThrow(TenantScopeError);
    });
  });
});
