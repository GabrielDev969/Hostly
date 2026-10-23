import { describe, expect, it } from 'vitest';
import { membershipFor, ROLE_PERMISSIONS, type RoleName } from '../../../test/fixtures';
import { buildMenu, findMenuItem, isInMenu } from './menu';

const labels = (role: RoleName) => {
  const membership = membershipFor(role);
  return buildMenu({ scopeKind: membership.scope.kind, permissions: membership.permissions }).map(
    (group) => [group.label, group.items.map((item) => item.label)],
  );
};

const FULL_MENU = [
  ['Operação', ['Visão geral', 'Robôs', 'Agenda e rotas']],
  ['Conteúdo', ['Mídia', 'Playlists', 'Campanhas', 'Falas']],
  ['Negócio', ['Clientes', 'Marcas', 'Anunciantes', 'Relatórios']],
  [null, ['Configurações']],
];

const CLIENT_MENU = [
  ['Operação', ['Visão geral', 'Robôs', 'Agenda e rotas']],
  ['Conteúdo', ['Mídia', 'Playlists', 'Campanhas', 'Falas']],
  ['Negócio', ['Anunciantes', 'Relatórios']],
];

describe('buildMenu', () => {
  it('gives the operator admin every page, in the prototype order', () => {
    expect(labels('operator_admin')).toEqual(FULL_MENU);
  });

  it('gives the operator staff every page too', () => {
    expect(labels('operator_staff')).toEqual(FULL_MENU);
  });

  it('hides Clientes, Marcas and Configurações from the client admin', () => {
    expect(labels('client_admin')).toEqual(CLIENT_MENU);
  });

  it('hides the same pages from the client editor', () => {
    expect(labels('client_editor')).toEqual(CLIENT_MENU);
  });

  it('gives the advertiser only Mídia, Campanhas and Relatórios', () => {
    expect(labels('advertiser')).toEqual([
      ['Conteúdo', ['Mídia', 'Campanhas']],
      ['Negócio', ['Relatórios']],
    ]);
  });

  it('follows permissions, not role names, for custom roles', () => {
    const menu = buildMenu({ scopeKind: 'operator', permissions: ['workspace:read'] });
    const keys = menu.flatMap((group) => group.items.map((item) => item.key));
    expect(keys).not.toContain('robots');
    expect(keys).not.toContain('clients');
    expect(keys).not.toContain('settings');
    expect(keys).toContain('brands');
  });

  it('never gives Clientes to a client membership, even with client:read', () => {
    const menu = buildMenu({
      scopeKind: 'client',
      permissions: [...ROLE_PERMISSIONS.client_admin],
    });
    expect(isInMenu(menu, 'clients')).toBe(false);
  });

  it('drops a group left without items', () => {
    const menu = buildMenu({ scopeKind: 'advertiser', permissions: [] });
    expect(menu.map((group) => group.key)).toEqual(['content', 'business']);
  });
});

describe('findMenuItem', () => {
  it('matches the page and its sub-pages, not look-alike prefixes', () => {
    expect(findMenuItem('/robots')?.key).toBe('robots');
    expect(findMenuItem('/robots/abc')?.key).toBe('robots');
    expect(findMenuItem('/robotsx')).toBeUndefined();
    expect(findMenuItem('/')).toBeUndefined();
  });
});
