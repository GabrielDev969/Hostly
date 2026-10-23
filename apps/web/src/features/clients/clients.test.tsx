import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CLIENT_A, CLIENT_B, WORKSPACE_ID } from '../../../test/fixtures';
import { CLIENT_C, renderClients } from '../../../test/clients';
import { navigation } from '../../../test/navigation';
import { presenceEvent, ROBOT_A, SITE_A } from '../../../test/robots';
import { CLIENT_INTERNAL } from '../../../test/settings';
import { ClientDetail } from './client-detail';
import { NoClientSelected } from './clients-page';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const TIMEZONE_ERROR =
  'timezone must be an IANA region time zone such as America/Sao_Paulo, or UTC';

const detail = (clientId: string, options: Parameters<typeof renderClients>[1] = {}) =>
  renderClients(<ClientDetail clientId={clientId} />, { path: `/clients/${clientId}`, ...options });

const section = async (name: string) => within(await screen.findByRole('region', { name }));
const dialog = () => within(screen.getByRole('dialog'));

describe('clients list and detail', () => {
  it('lists every client with a one-line summary and opens the chosen one', async () => {
    detail(CLIENT_A);

    const nav = within(await screen.findByRole('navigation', { name: 'Clientes' }));
    await waitFor(() =>
      expect(nav.getByRole('link', { name: /Shopping Alfa/ })).toHaveTextContent(
        'Shopping AlfaAtivo · 1 local · 1 robô',
      ),
    );
    expect(nav.getByRole('link', { name: /Shopping Beta/ })).toHaveTextContent(
      'Ativo · 1 local · 1 robô',
    );
    expect(nav.getByRole('link', { name: /Shopping Gama/ })).toHaveTextContent(
      'Implantação · 0 locais · 0 robôs',
    );
    expect(nav.getByRole('link', { name: /Robôs próprios/ })).toHaveTextContent(
      'Robôs próprios · 1 local · 0 robôs',
    );
    expect(nav.getByRole('link', { name: /Shopping Alfa/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(nav.getByRole('link', { name: /Shopping Beta/ })).not.toHaveAttribute('aria-current');
    expect(nav.getByRole('link', { name: /Shopping Gama/ })).toHaveAttribute(
      'href',
      `/clients/${CLIENT_C}`,
    );
  });

  it('shows the real numbers, and "Em breve" for the ones the API does not have', async () => {
    detail(CLIENT_A);

    const header = within(await screen.findByRole('region', { name: 'Shopping Alfa' }));
    expect(header.getByText('Ativo')).toBeInTheDocument();
    const stats = () =>
      Object.fromEntries(
        header
          .getAllByRole('term')
          .map((term) => [term.textContent, term.nextElementSibling?.textContent]),
      );
    // The revoked robot of the client does not count.
    await waitFor(() =>
      expect(stats()).toEqual({
        Robôs: '1',
        Locais: '1',
        'Exibições no mês': 'Em breve',
        Anunciantes: 'Em breve',
        Contrato: 'Em breve',
      }),
    );
    expect(screen.queryByText(/Marca em uso/)).not.toBeInTheDocument();
    await waitFor(() => expect(document.body.textContent).not.toMatch(UUID));
  });

  it('shows each site with its time zone, address and linked robots', async () => {
    detail(CLIENT_A);

    const sites = await section('Locais e robôs');
    expect(await sites.findByRole('heading', { name: 'Alfa - Piso L1' })).toBeInTheDocument();
    expect(sites.getByText('America/Sao_Paulo')).toBeInTheDocument();
    expect(sites.getByText(/Av\. Alfa, 100/)).toBeInTheDocument();
    const robots = within(await sites.findByRole('list', { name: 'Robôs em Alfa - Piso L1' }));
    expect(robots.getByRole('link', { name: 'Robô Alfa' })).toHaveAttribute(
      'href',
      `/robots/${ROBOT_A}`,
    );
    expect(robots.getByText('Online')).toBeInTheDocument();
    expect(sites.queryByText('Robô Velho')).not.toBeInTheDocument();
  });

  it('says when a client has no site yet', async () => {
    detail(CLIENT_C);
    expect(
      await (await section('Locais e robôs')).findByText('Nenhum local ainda.'),
    ).toBeInTheDocument();
  });

  it('updates the robot status live', async () => {
    const { live } = detail(CLIENT_A);

    const robots = within(await screen.findByRole('list', { name: 'Robôs em Alfa - Piso L1' }));
    expect(robots.getByText('Online')).toBeInTheDocument();
    await waitFor(() => expect(live.open()).toHaveLength(1));
    // The REST reload that every open triggers lands first.
    await new Promise((resolve) => setTimeout(resolve, 50));

    live.send(presenceEvent('robot.offline', ROBOT_A));
    expect(await robots.findByText('Offline')).toBeInTheDocument();
  });

  it('asks to choose a client on /clients', async () => {
    renderClients(<NoClientSelected />, { path: '/clients' });
    expect(await screen.findByText('Escolha um cliente na lista.')).toBeInTheDocument();
  });

  it('says a client is not found when the list does not have it', async () => {
    detail('00000000-0000-4000-8000-000000000000');
    expect(await screen.findByText('Cliente não encontrado')).toBeInTheDocument();
  });
});

describe('permissions', () => {
  it('gives the operator admin every action', async () => {
    detail(CLIENT_A);

    expect(await screen.findByRole('button', { name: 'Novo cliente' })).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Editar o cliente Shopping Alfa' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Novo local' })).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Editar o local Alfa - Piso L1' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Convidar' })).toBeInTheDocument();
  });

  it('shows the operator staff everything, with no create, edit or invite', async () => {
    detail(CLIENT_A, { role: 'operator_staff' });

    expect(
      await (await section('Locais e robôs')).findByRole('heading', { name: 'Alfa - Piso L1' }),
    ).toBeInTheDocument();
    expect(
      await (await section('Acessos do cliente')).findByText('Carla Cliente'),
    ).toBeInTheDocument();
    for (const name of [/Novo cliente/, /Editar/, /Novo local/, /Convidar/]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it.each(['client_admin', 'client_editor'] as const)(
    'keeps a %s out of the page',
    async (role) => {
      const { clients } = detail(CLIENT_A, { role });

      expect(await screen.findByText('Sem acesso a esta página')).toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: 'Clientes' })).not.toBeInTheDocument();
      expect(clients.calls.urls.some((url) => /\/(sites|robots|live|members)/.test(url))).toBe(
        false,
      );
    },
  );

  it('leaves out sites, robots and access without their read permissions', async () => {
    const { clients } = detail(CLIENT_A, { permissions: ['client:read', 'client:update'] });

    expect(await screen.findByRole('region', { name: 'Shopping Alfa' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Locais e robôs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Acessos do cliente' })).not.toBeInTheDocument();
    expect((await section('Shopping Alfa')).queryByText('Robôs')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Clientes' })).getByRole('link', {
        name: /Shopping Alfa/,
      }),
    ).toHaveTextContent(/^Shopping AlfaAtivo$/);
    expect(clients.calls.urls.some((url) => /\/(sites|robots|live|members)/.test(url))).toBe(false);
  });
});

describe('client form', () => {
  it('creates a client in onboarding, reloads the list and opens it', async () => {
    const user = userEvent.setup();
    const { clients, queryClient } = detail(CLIENT_A);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(await screen.findByRole('button', { name: 'Novo cliente' }));
    await user.type(dialog().getByLabelText('Nome'), 'D');
    await user.click(dialog().getByRole('button', { name: 'Criar cliente' }));
    expect(dialog().getByText('O nome tem de 2 a 120 caracteres.')).toBeInTheDocument();
    expect(dialog().getByLabelText('Nome')).toHaveAttribute('aria-invalid', 'true');
    expect(clients.calls.creates).toEqual([]);

    await user.type(dialog().getByLabelText('Nome'), 'elta Mall ');
    expect(dialog().getByLabelText('Status')).toHaveValue('onboarding');
    await user.click(dialog().getByRole('button', { name: 'Criar cliente' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(clients.calls.creates).toEqual([{ name: 'Delta Mall', status: 'onboarding' }]);
    expect(screen.getByText('Cliente Delta Mall criado.')).toBeInTheDocument();
    const created = clients.clients.find((c) => c.name === 'Delta Mall')!;
    expect(navigation.router.push).toHaveBeenCalledWith(`/clients/${created.id}`);
    // ['clients', workspaceId] reloads: the menu's client selector lists it too.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['clients', WORKSPACE_ID] });
    expect(
      within(screen.getByLabelText('Cliente')).getByRole('option', { name: 'Delta Mall' }),
    ).toBeInTheDocument();
  });

  it('edits only what changed and refreshes the menu selector', async () => {
    const user = userEvent.setup();
    const { clients, queryClient } = detail(CLIENT_A);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(await screen.findByRole('button', { name: 'Editar o cliente Shopping Alfa' }));
    expect(dialog().getByRole('button', { name: 'Salvar' })).toBeDisabled();
    await user.selectOptions(dialog().getByLabelText('Status'), 'paused');
    await user.click(dialog().getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(clients.calls.updates).toEqual([{ id: CLIENT_A, body: { status: 'paused' } }]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['clients', WORKSPACE_ID] });
    expect(
      await within(screen.getByRole('region', { name: 'Shopping Alfa' })).findByText('Pausado'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Editar o cliente Shopping Alfa' }));
    await user.clear(dialog().getByLabelText('Nome'));
    await user.type(dialog().getByLabelText('Nome'), 'Alfa Center');
    await user.click(dialog().getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(clients.calls.updates[1]).toEqual({ id: CLIENT_A, body: { name: 'Alfa Center' } });
    expect(
      await within(screen.getByLabelText('Cliente')).findByRole('option', { name: 'Alfa Center' }),
    ).toBeInTheDocument();
  });

  it("shows the API's validation message as it came", async () => {
    const user = userEvent.setup();
    detail(CLIENT_A, {
      replies: { update: [{ status: 400, details: ['name must be a string'] }] },
    });

    await user.click(await screen.findByRole('button', { name: 'Editar o cliente Shopping Alfa' }));
    await user.type(dialog().getByLabelText('Nome'), ' 2');
    await user.click(dialog().getByRole('button', { name: 'Salvar' }));

    expect(await dialog().findByRole('alert')).toHaveTextContent(/^name must be a string$/);
  });

  it('names the missing permission on a 403', async () => {
    const user = userEvent.setup();
    detail(CLIENT_A, {
      replies: { create: [{ status: 403, message: 'Permission required: client:create' }] },
    });

    await user.click(await screen.findByRole('button', { name: 'Novo cliente' }));
    await user.type(dialog().getByLabelText('Nome'), 'Delta Mall');
    await user.click(dialog().getByRole('button', { name: 'Criar cliente' }));

    expect(await dialog().findByRole('alert')).toHaveTextContent('Falta permissão: client:create.');
  });

  it('keeps the internal client always active: no status to change, no access to grant', async () => {
    const user = userEvent.setup();
    const { clients } = detail(CLIENT_INTERNAL);

    const header = within(await screen.findByRole('region', { name: 'Robôs próprios' }));
    expect(header.getByText('Robôs próprios', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Acessos do cliente' })).not.toBeInTheDocument();

    await user.click(header.getByRole('button', { name: 'Editar o cliente Robôs próprios' }));
    expect(dialog().queryByLabelText('Status')).not.toBeInTheDocument();
    await user.clear(dialog().getByLabelText('Nome'));
    await user.type(dialog().getByLabelText('Nome'), 'Frota própria');
    await user.click(dialog().getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(clients.calls.updates).toEqual([
        { id: CLIENT_INTERNAL, body: { name: 'Frota própria' } },
      ]),
    );
  });
});

describe('site form', () => {
  it('creates a site in São Paulo time by default and reloads the sites', async () => {
    const user = userEvent.setup();
    const { clients, queryClient } = detail(CLIENT_C);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(await screen.findByRole('button', { name: 'Novo local' }));
    const timezone = dialog().getByLabelText('Fuso horário');
    expect(timezone).toHaveValue('America/Sao_Paulo');
    expect(within(timezone).getAllByRole('option')[0]).toHaveValue('America/Sao_Paulo');
    expect(within(timezone).getByRole('option', { name: 'UTC' })).toBeInTheDocument();
    expect(within(timezone).queryByRole('option', { name: /^Etc\// })).not.toBeInTheDocument();

    await user.type(dialog().getByLabelText('Nome'), 'Gama - Térreo');
    await user.click(dialog().getByRole('button', { name: 'Criar local' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(clients.calls.siteCreates).toEqual([
      { clientId: CLIENT_C, name: 'Gama - Térreo', timezone: 'America/Sao_Paulo' },
    ]);
    const sites = await section('Locais e robôs');
    expect(await sites.findByRole('heading', { name: 'Gama - Térreo' })).toBeInTheDocument();
    expect(sites.getByText('Nenhum robô ligado ainda.')).toBeInTheDocument();
    expect(screen.getByText('Local Gama - Térreo criado.')).toBeInTheDocument();
    // ['sites', workspaceId] also feeds the site choice of "Parear robô" in Settings.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['sites', WORKSPACE_ID] });
  });

  it("shows the API's time zone message exactly as it came", async () => {
    const user = userEvent.setup();
    const { clients } = detail(CLIENT_C, {
      replies: { siteCreate: [{ status: 400, details: [TIMEZONE_ERROR] }] },
    });

    await user.click(await screen.findByRole('button', { name: 'Novo local' }));
    await user.type(dialog().getByLabelText('Nome'), 'Gama - Térreo');
    await user.selectOptions(dialog().getByLabelText('Fuso horário'), 'Asia/Tokyo');
    await user.click(dialog().getByRole('button', { name: 'Criar local' }));

    expect(await dialog().findByRole('alert')).toHaveTextContent(new RegExp(`^${TIMEZONE_ERROR}$`));
    expect(clients.calls.siteCreates).toEqual([
      { clientId: CLIENT_C, name: 'Gama - Térreo', timezone: 'Asia/Tokyo' },
    ]);
  });

  it('edits a site and sends null when the address is cleared', async () => {
    const user = userEvent.setup();
    const { clients } = detail(CLIENT_A);

    await user.click(await screen.findByRole('button', { name: 'Editar o local Alfa - Piso L1' }));
    expect(dialog().getByLabelText('Endereço (opcional)')).toHaveValue('Av. Alfa, 100');
    await user.clear(dialog().getByLabelText('Endereço (opcional)'));
    await user.click(dialog().getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(clients.calls.siteUpdates).toEqual([{ id: SITE_A, body: { address: null } }]);
    const sites = await section('Locais e robôs');
    await waitFor(() => expect(sites.queryByText(/Av\. Alfa/)).not.toBeInTheDocument());
  });
});

describe('client access', () => {
  it("lists only the client's members", async () => {
    detail(CLIENT_A);

    const access = await section('Acessos do cliente');
    expect(await access.findByText('Carla Cliente')).toBeInTheDocument();
    expect(access.getByText('Admin do cliente')).toBeInTheDocument();
    expect(access.getByText('Davi Anunciante')).toBeInTheDocument();
    for (const name of ['Ana Souza', 'Otávio Dono', 'Bruno Equipe']) {
      expect(access.queryByText(name)).not.toBeInTheDocument();
    }
  });

  it('shows the pending invitations of the client', async () => {
    detail(CLIENT_B);

    const access = await section('Acessos do cliente');
    expect(await access.findByText('eva@example.com')).toBeInTheDocument();
    expect(await access.findByText('Convite pendente · Editor do cliente')).toBeInTheDocument();
    // Accepted: not pending any more.
    expect(access.queryByText('gil@example.com')).not.toBeInTheDocument();
  });

  it('says only the team has access when nobody of the client does', async () => {
    detail(CLIENT_C);

    const access = await section('Acessos do cliente');
    expect(await access.findByText('Só a sua equipe acessa.')).toBeInTheDocument();
    expect(
      access.getByText('Quem é do cliente vê só os robôs, a mídia e os relatórios dele.'),
    ).toBeInTheDocument();
  });

  it('invites into this client with the client fixed and only client roles', async () => {
    const user = userEvent.setup();
    const { settings } = detail(CLIENT_C);

    const access = await section('Acessos do cliente');
    await user.click(await access.findByRole('button', { name: 'Convidar' }));
    const role = dialog().getByLabelText('Papel');
    await waitFor(() =>
      expect(
        within(role)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Escolha o papel', 'Admin do cliente', 'Editor do cliente']),
    );
    const client = within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Cliente' });
    expect(client).toHaveValue('Shopping Gama');
    expect(client).toHaveAttribute('readonly');

    await user.type(dialog().getByLabelText('E-mail'), 'hugo@example.com');
    await user.selectOptions(role, 'role-client_admin');
    await user.click(dialog().getByRole('button', { name: 'Enviar convite' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(settings.calls.invites).toEqual([
      { email: 'hugo@example.com', roleId: 'role-client_admin', clientId: CLIENT_C },
    ]);
    expect(screen.getByText('Convite enviado para hugo@example.com.')).toBeInTheDocument();
    expect(await access.findByText('hugo@example.com')).toBeInTheDocument();
  });
});
