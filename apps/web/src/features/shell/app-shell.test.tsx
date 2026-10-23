import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import PanelLayout from '@/app/(panel)/layout';
import PanelHome from '@/app/(panel)/page';
import { ComingSoon } from '@/components/states';
import { CLIENT_A, CLIENT_B, type RoleName } from '../../../test/fixtures';
import { ACCESS_TOKEN, panelHandlers } from '../../../test/handlers';
import { navigation, setLocation } from '../../../test/navigation';
import { renderWithSession } from '../../../test/render';
import { API, server } from '../../../test/server';

function renderPanel(role: RoleName, path = '/overview', page = <ComingSoon title="Página" />) {
  const api = panelHandlers(role);
  server.use(...api.handlers);
  setLocation(path);
  return { ...renderWithSession(<PanelLayout>{page}</PanelLayout>), ...api };
}

async function menuLabels() {
  const nav = await screen.findByRole('navigation', { name: 'Menu principal' });
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent);
}

const ALL_PAGES = [
  'Visão geral',
  'Robôs',
  'Agenda e rotas',
  'Mídia',
  'Playlists',
  'Campanhas',
  'Falas',
  'Clientes',
  'Marcas',
  'Anunciantes',
  'Relatórios',
  'Configurações',
];
const CLIENT_PAGES = [
  'Visão geral',
  'Robôs',
  'Agenda e rotas',
  'Mídia',
  'Playlists',
  'Campanhas',
  'Falas',
  'Anunciantes',
  'Relatórios',
];

describe('panel menu per role', () => {
  it.each([
    ['operator_admin', ALL_PAGES],
    ['operator_staff', ALL_PAGES],
    ['client_admin', CLIENT_PAGES],
    ['client_editor', CLIENT_PAGES],
    ['advertiser', ['Mídia', 'Campanhas', 'Relatórios']],
  ] as const)('%s sees its pages', async (role, pages) => {
    renderPanel(role);
    expect(await menuLabels()).toEqual(pages);
  });

  it('shows the organization name from the API at the top of the menu', async () => {
    renderPanel('operator_admin');
    expect(await screen.findByText('Operadora Teste')).toBeInTheDocument();
  });

  it('marks the current page', async () => {
    renderPanel('operator_admin', '/robots');
    const nav = await screen.findByRole('navigation', { name: 'Menu principal' });
    expect(within(nav).getByRole('link', { name: 'Robôs' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Mídia' })).not.toHaveAttribute('aria-current');
  });

  it('shows "no access" on a page outside the menu of the role', async () => {
    renderPanel('client_editor', '/clients', <ComingSoon title="Clientes" />);
    expect(await screen.findByText('Sem acesso a esta página')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Clientes' })).not.toBeInTheDocument();
  });

  it('sends the panel home to the first page of the menu', async () => {
    renderPanel('advertiser', '/', <PanelHome />);
    await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith('/media'));
  });
});

describe('client selector', () => {
  it('lets the operator pick a client, with "Todos os clientes" first', async () => {
    renderPanel('operator_admin', '/robots');
    const select = await screen.findByRole('combobox', { name: 'Cliente' });
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(3));
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Todos os clientes', 'Shopping Alfa', 'Shopping Beta']);

    await userEvent.setup().selectOptions(select, CLIENT_B);

    expect(navigation.router.replace).toHaveBeenCalledWith(`/robots?client=${CLIENT_B}`);
  });

  it('keeps the chosen client in the menu links', async () => {
    renderPanel('operator_admin', `/robots?client=${CLIENT_A}`);
    const nav = await screen.findByRole('navigation', { name: 'Menu principal' });
    await waitFor(() =>
      expect(within(nav).getByRole('link', { name: 'Mídia' })).toHaveAttribute(
        'href',
        `/media?client=${CLIENT_A}`,
      ),
    );
    expect(screen.getByRole('combobox', { name: 'Cliente' })).toHaveValue(CLIENT_A);
  });

  it('ignores a client id the API did not return', async () => {
    renderPanel('operator_admin', '/robots?client=99999999-9999-4999-8999-999999999999');
    const select = await screen.findByRole('combobox', { name: 'Cliente' });
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(3));
    expect(select).toHaveValue('');
    const nav = screen.getByRole('navigation', { name: 'Menu principal' });
    expect(within(nav).getByRole('link', { name: 'Mídia' })).toHaveAttribute('href', '/media');
  });

  it('shows the client user only their own client, fixed', async () => {
    renderPanel('client_admin');
    expect(await screen.findByText('Shopping Alfa')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Cliente' })).not.toBeInTheDocument();
    expect(screen.queryByText('Shopping Beta')).not.toBeInTheDocument();
  });

  it('hides the selector from the advertiser', async () => {
    const { calls } = renderPanel('advertiser');
    await menuLabels();
    expect(screen.queryByText('Cliente')).not.toBeInTheDocument();
    expect(calls.requests.some((url) => url.includes('/api/v1/clients'))).toBe(false);
  });
});

describe('session in the panel', () => {
  it('says which setting is missing when the API URL is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    try {
      renderPanel('operator_admin');
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'O painel está sem a configuração NEXT_PUBLIC_API_URL',
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('logs out: calls the API, clears the session and goes to the login', async () => {
    const { calls, queryClient } = renderPanel('operator_admin');
    await menuLabels();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith('/login'));
    expect(calls.logout).toEqual([{ authorization: `Bearer ${ACCESS_TOKEN}` }]);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(screen.queryByRole('navigation', { name: 'Menu principal' })).not.toBeInTheDocument();
  });

  it('sends an anonymous visitor to the login with the page to come back to, refreshing once', async () => {
    const api = panelHandlers('operator_admin', { refreshValid: false });
    server.use(...api.handlers);
    setLocation(`/robots?client=${CLIENT_A}`);
    renderWithSession(
      <PanelLayout>
        <ComingSoon title="Robôs" />
      </PanelLayout>,
    );

    await waitFor(() =>
      expect(navigation.router.replace).toHaveBeenCalledWith(
        `/login?next=${encodeURIComponent(`/robots?client=${CLIENT_A}`)}`,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(api.calls.refresh).toBe(1);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('goes to the login without looping when the session expires mid-use', async () => {
    const api = panelHandlers('operator_admin');
    let clientsCalls = 0;
    server.use(
      http.get(`${API}/api/v1/clients`, () => {
        clientsCalls += 1;
        api.cookie.valid = false;
        return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }),
      ...api.handlers,
    );
    setLocation('/overview');
    renderWithSession(
      <PanelLayout>
        <ComingSoon title="Visão geral" />
      </PanelLayout>,
    );

    await waitFor(() =>
      expect(navigation.router.replace).toHaveBeenCalledWith('/login?next=%2Foverview'),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(api.calls.refresh).toBe(2);
    expect(clientsCalls).toBe(1);
  });
});
