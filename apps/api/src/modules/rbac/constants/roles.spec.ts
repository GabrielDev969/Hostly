import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  DEFAULT_ROLES,
  assertCanGrant,
  assertCanManageRoles,
  assertRoleFitsScope,
  scopeKindOf,
} from './roles';

const operator = { clientId: null, advertiserId: null };
const client = { clientId: 'client-a', advertiserId: null };
const otherClient = { clientId: 'client-b', advertiserId: null };
const advertiser = { clientId: 'client-a', advertiserId: 'adv-1' };

const systemRole = (name: string) => {
  const role = DEFAULT_ROLES.find((r) => r.name === name)!;
  return { name: role.name, permissions: role.permissionKeys.map((key) => ({ key })) };
};
const customRole = (...keys: string[]) => ({
  name: 'night-shift',
  permissions: keys.map((key) => ({ key })),
});

describe('Hostly roles', () => {
  it('derives the scope kind from the membership ids', () => {
    expect(scopeKindOf(operator)).toBe('operator');
    expect(scopeKindOf(client)).toBe('client');
    expect(scopeKindOf(advertiser)).toBe('advertiser');
  });

  it.each([
    ['operator_admin', operator],
    ['operator_staff', operator],
    ['client_admin', client],
    ['client_editor', client],
    ['advertiser', advertiser],
  ])('accepts %s on a matching membership', (name, membership) => {
    expect(() => assertRoleFitsScope(systemRole(name), membership)).not.toThrow();
  });

  it.each([
    ['operator_admin', client],
    ['client_admin', operator],
    ['client_editor', advertiser],
    ['advertiser', client],
  ])('rejects %s on a mismatched membership', (name, membership) => {
    expect(() => assertRoleFitsScope(systemRole(name), membership)).toThrow(BadRequestException);
  });

  describe('permission ceiling for custom roles', () => {
    it('lets a custom role within the ceiling go to client and advertiser memberships', () => {
      expect(() =>
        assertRoleFitsScope(customRole('workspace:read', 'audit:read'), client),
      ).not.toThrow();
      expect(() => assertRoleFitsScope(customRole('workspace:read'), advertiser)).not.toThrow();
    });

    it.each([['workspace:invite'], ['user:read'], ['user:create'], ['role:assign']])(
      'keeps a custom role with %s away from client memberships',
      (key) => {
        expect(() => assertRoleFitsScope(customRole('workspace:read', key), client)).toThrow(
          BadRequestException,
        );
      },
    );

    it('lets client memberships read their client and sites, but never write them', () => {
      expect(() =>
        assertRoleFitsScope(customRole('client:read', 'site:read'), client),
      ).not.toThrow();
      for (const key of ['client:create', 'client:update', 'client:delete', 'site:create']) {
        expect(() => assertRoleFitsScope(customRole(key), client)).toThrow(BadRequestException);
      }
    });

    it.each([['client:read'], ['site:read']])('keeps %s away from advertisers', (key) => {
      expect(() => assertRoleFitsScope(customRole(key), advertiser)).toThrow(BadRequestException);
    });

    it('keeps audit access away from advertisers', () => {
      expect(() => assertRoleFitsScope(customRole('audit:read'), advertiser)).toThrow(
        BadRequestException,
      );
    });

    it('puts no ceiling on operator memberships', () => {
      expect(() =>
        assertRoleFitsScope(customRole('user:delete', 'workspace:invite'), operator),
      ).not.toThrow();
    });
  });

  describe('who may grant', () => {
    it('lets operators grant to any membership', () => {
      for (const membership of [operator, client, advertiser]) {
        expect(() => assertCanGrant(operator, membership)).not.toThrow();
      }
    });

    it('stops client and advertiser users from granting operator-scoped roles', () => {
      expect(() => assertCanGrant(client, operator)).toThrow(ForbiddenException);
      expect(() => assertCanGrant(advertiser, operator)).toThrow(ForbiddenException);
    });

    it('keeps non-operators inside their own client and advertiser', () => {
      expect(() => assertCanGrant(client, client)).not.toThrow();
      expect(() => assertCanGrant(client, advertiser)).not.toThrow();
      expect(() => assertCanGrant(client, otherClient)).toThrow(ForbiddenException);
      expect(() => assertCanGrant(advertiser, client)).toThrow(ForbiddenException);
      expect(() => assertCanGrant(null, operator)).toThrow(ForbiddenException);
    });

    it('lets only operators manage roles', () => {
      expect(() => assertCanManageRoles(operator)).not.toThrow();
      expect(() => assertCanManageRoles(client)).toThrow(ForbiddenException);
      expect(() => assertCanManageRoles(null)).toThrow(ForbiddenException);
    });
  });
});
