export type ScopeKind = 'operator' | 'client' | 'advertiser';

export type MenuKey =
  | 'overview'
  | 'robots'
  | 'schedule'
  | 'media'
  | 'playlists'
  | 'campaigns'
  | 'speech'
  | 'clients'
  | 'brands'
  | 'advertisers'
  | 'reports'
  | 'settings';

export interface MenuItem {
  key: MenuKey;
  label: string;
  href: string;
  scopes: readonly ScopeKind[];
  // Shown when the membership holds any of these. Pages whose permission does not exist yet
  // (media, campaigns...) gate by scope only; their issue adds the permission here.
  anyPermission?: readonly string[];
}

export interface MenuGroup {
  key: 'operation' | 'content' | 'business' | 'settings';
  label: string | null;
  items: MenuItem[];
}

const EVERYONE: readonly ScopeKind[] = ['operator', 'client', 'advertiser'];
const OPERATOR_AND_CLIENT: readonly ScopeKind[] = ['operator', 'client'];
const OPERATOR: readonly ScopeKind[] = ['operator'];

// Comfort, not security: the API decides what each membership can read.
export const MENU: readonly MenuGroup[] = [
  {
    key: 'operation',
    label: 'Operação',
    items: [
      { key: 'overview', label: 'Visão geral', href: '/overview', scopes: OPERATOR_AND_CLIENT },
      {
        key: 'robots',
        label: 'Robôs',
        href: '/robots',
        scopes: OPERATOR_AND_CLIENT,
        anyPermission: ['robot:read'],
      },
      { key: 'schedule', label: 'Agenda e rotas', href: '/schedule', scopes: OPERATOR_AND_CLIENT },
    ],
  },
  {
    key: 'content',
    label: 'Conteúdo',
    items: [
      { key: 'media', label: 'Mídia', href: '/media', scopes: EVERYONE },
      { key: 'playlists', label: 'Playlists', href: '/playlists', scopes: OPERATOR_AND_CLIENT },
      { key: 'campaigns', label: 'Campanhas', href: '/campaigns', scopes: EVERYONE },
      { key: 'speech', label: 'Falas', href: '/speech', scopes: OPERATOR_AND_CLIENT },
    ],
  },
  {
    key: 'business',
    label: 'Negócio',
    items: [
      {
        key: 'clients',
        label: 'Clientes',
        href: '/clients',
        scopes: OPERATOR,
        anyPermission: ['client:read'],
      },
      { key: 'brands', label: 'Marcas', href: '/brands', scopes: OPERATOR },
      {
        key: 'advertisers',
        label: 'Anunciantes',
        href: '/advertisers',
        scopes: OPERATOR_AND_CLIENT,
      },
      { key: 'reports', label: 'Relatórios', href: '/reports', scopes: EVERYONE },
    ],
  },
  {
    key: 'settings',
    label: null,
    items: [
      {
        key: 'settings',
        label: 'Configurações',
        href: '/settings',
        scopes: OPERATOR_AND_CLIENT,
        anyPermission: ['user:read', 'role:read', 'robot:pair', 'workspace:update'],
      },
    ],
  },
];

export function buildMenu(membership: {
  scopeKind: ScopeKind;
  permissions: readonly string[];
}): MenuGroup[] {
  const held = new Set(membership.permissions);
  const visible = (item: MenuItem) =>
    item.scopes.includes(membership.scopeKind) &&
    (!item.anyPermission || item.anyPermission.some((key) => held.has(key)));
  return MENU.map((group) => ({ ...group, items: group.items.filter(visible) })).filter(
    (group) => group.items.length > 0,
  );
}

export function findMenuItem(pathname: string): MenuItem | undefined {
  return MENU.flatMap((group) => group.items).find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}

export function isInMenu(menu: readonly MenuGroup[], key: MenuKey): boolean {
  return menu.some((group) => group.items.some((item) => item.key === key));
}
