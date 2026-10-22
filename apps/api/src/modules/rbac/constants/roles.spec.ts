import { BadRequestException } from '@nestjs/common';
import { assertRoleFitsScope, scopeKindOf } from './roles';

const operator = { clientId: null, advertiserId: null };
const client = { clientId: 'client-a', advertiserId: null };
const advertiser = { clientId: 'client-a', advertiserId: 'adv-1' };

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
  ])('accepts %s on a matching membership', (role, membership) => {
    expect(() => assertRoleFitsScope(role, membership)).not.toThrow();
  });

  it.each([
    ['operator_admin', client],
    ['client_admin', operator],
    ['client_editor', advertiser],
    ['advertiser', client],
  ])('rejects %s on a mismatched membership', (role, membership) => {
    expect(() => assertRoleFitsScope(role, membership)).toThrow(BadRequestException);
  });

  it('lets custom roles follow the membership scope', () => {
    expect(() => assertRoleFitsScope('night-shift', client)).not.toThrow();
  });
});
