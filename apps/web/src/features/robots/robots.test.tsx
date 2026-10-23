import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PanelLayout from '@/app/(panel)/layout';
import { RobotDetail } from './robot-detail';
import { RobotsList } from './robots-list';
import { LiveRobotsProvider } from './live/live-robots';
import { CLIENT_B, type RoleName } from '../../../test/fixtures';
import { panelHandlers } from '../../../test/handlers';
import { setLocation } from '../../../test/navigation';
import { renderWithSession } from '../../../test/render';
import {
  historyFixture,
  liveSocket,
  point,
  ROBOT_A,
  ROBOT_B,
  robotFixture,
  robotsApi,
  SITE_B,
} from '../../../test/robots';
import { API, server } from '../../../test/server';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function renderPage(
  page: ReactElement,
  {
    role = 'operator_admin',
    path = '/robots',
    ...options
  }: { role?: RoleName; path?: string } & Parameters<typeof robotsApi>[1] = {},
) {
  const session = panelHandlers(role);
  const robots = robotsApi(role, options);
  const live = liveSocket();
  server.use(...session.handlers, ...robots.handlers, live.handler);
  setLocation(path);
  const rendered = renderWithSession(
    <PanelLayout>
      <LiveRobotsProvider delay={() => 20}>{page}</LiveRobotsProvider>
    </PanelLayout>,
  );
  return { ...rendered, session, robots, live };
}

const detail = (options: Parameters<typeof renderPage>[1] = {}) =>
  renderPage(<RobotDetail robotId={ROBOT_A} />, { path: `/robots/${ROBOT_A}`, ...options });

afterEach(() => vi.restoreAllMocks());

describe('robots list', () => {
  it('shows each robot with client and site names, status, battery, mode and app version', async () => {
    renderPage(<RobotsList />);

    const table = await screen.findByRole('table', { name: 'Robôs' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((c) => c.textContent),
      ),
    ).toEqual([
      ['Shopping Alfa', 'Alfa - Piso L1', 'Online', '80%', 'Cruzeiro', '1.0.0'],
      ['Shopping Beta', 'Beta - Piso L2', 'Offline', '—', '—', '0.9.0'],
    ]);
    await waitFor(() => expect(document.body.textContent).not.toMatch(UUID));
    expect(screen.getByRole('link', { name: 'Robô Alfa' })).toHaveAttribute(
      'href',
      `/robots/${ROBOT_A}`,
    );
  });

  it('filters by the chosen client and keeps it on the detail link', async () => {
    const { robots } = renderPage(<RobotsList />, { path: `/robots?client=${CLIENT_B}` });

    await waitFor(() =>
      expect(robots.calls.list.some((url) => url.searchParams.get('clientId') === CLIENT_B)).toBe(
        true,
      ),
    );
    expect(await screen.findByRole('link', { name: 'Robô Beta' })).toHaveAttribute(
      'href',
      `/robots/${ROBOT_B}?client=${CLIENT_B}`,
    );
    await waitFor(() => expect(screen.queryByText('Robô Alfa')).not.toBeInTheDocument());
  });

  it('shows a client user only their robots', async () => {
    renderPage(<RobotsList />, { role: 'client_admin' });

    expect(await screen.findByRole('link', { name: 'Robô Alfa' })).toBeInTheDocument();
    expect(screen.queryByText('Robô Beta')).not.toBeInTheDocument();
  });

  it('shows pending and revoked robots with their status', async () => {
    renderPage(<RobotsList />, {
      robots: [robotFixture({ status: 'revoked', online: false })],
    });

    expect(await screen.findByText('Revogado')).toBeInTheDocument();
  });

  it('says so when there is no robot', async () => {
    renderPage(<RobotsList />, { robots: [] });

    expect(await screen.findByText('Nenhum robô')).toBeInTheDocument();
  });

  it('shows the loading state, then an error with a retry', async () => {
    const session = panelHandlers('operator_admin');
    let fail = true;
    server.use(
      ...session.handlers,
      http.get(`${API}/api/v1/robots`, () =>
        fail
          ? HttpResponse.json({ message: 'boom' }, { status: 500 })
          : HttpResponse.json([robotFixture()]),
      ),
      ...robotsApi('operator_admin').handlers,
      liveSocket().handler,
    );
    setLocation('/robots');
    renderWithSession(
      <PanelLayout>
        <LiveRobotsProvider delay={() => 20}>
          <RobotsList />
        </LiveRobotsProvider>
      </PanelLayout>,
    );

    expect(await screen.findByText('Carregando robôs…')).toBeInTheDocument();
    expect(await screen.findByText('Algo deu errado')).toBeInTheDocument();
    fail = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('link', { name: 'Robô Alfa' })).toBeInTheDocument();
  });
});

describe('robot detail', () => {
  it('shows status, position in meters and degrees, versions and the map points as coming soon', async () => {
    detail();

    expect(await screen.findByRole('heading', { name: 'Robô Alfa' })).toBeInTheDocument();
    const now = within(screen.getByRole('region', { name: 'Agora' }));
    expect(now.getByText('Online')).toBeInTheDocument();
    expect(now.getByText('80%')).toBeInTheDocument();
    expect(now.getByText('Cruzeiro')).toBeInTheDocument();
    expect(now.getByText(/^há \d+ d$/)).toBeInTheDocument();
    const position = within(screen.getByRole('region', { name: 'Posição' }));
    expect(position.getByText('1,50 m')).toBeInTheDocument();
    expect(position.getByText('-2,25 m')).toBeInTheDocument();
    expect(position.getByText('90°')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Pontos do mapa' })).getByText(/Em breve/),
    ).toBeInTheDocument();
  });

  it('says the robot is not found when it is out of scope', async () => {
    renderPage(<RobotDetail robotId={ROBOT_B} />, { role: 'client_admin' });
    expect(await screen.findByText('Robô não encontrado')).toBeInTheDocument();
  });

  it('does not call the API for a malformed id', async () => {
    const { session } = renderPage(<RobotDetail robotId="abc" />);
    expect(await screen.findByText('Robô não encontrado')).toBeInTheDocument();
    expect(session.calls.requests.some((url) => url.includes('/robots/abc'))).toBe(false);
  });

  it('draws the battery history with a text description and a table', async () => {
    detail({
      history: historyFixture([
        point('2026-10-23T10:00:00.000Z', 90),
        point('2026-10-23T10:05:00.000Z', 85, { charging: true }),
        point('2026-10-23T11:00:00.000Z', 38, { mode: 'base' }),
      ]),
    });

    const chart = await screen.findByRole('img', { name: /Histórico de bateria/ });
    expect(chart).toHaveAccessibleName(/última leitura 38%.*mínima 38%.*máxima 90%/);
    expect(chart.querySelectorAll('path')).toHaveLength(1);
    expect(chart.querySelectorAll('circle')).toHaveLength(1);
    const table = screen.getByRole('table', { name: 'Última leitura de bateria de cada hora' });
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) =>
          within(row)
            .getAllByRole('cell')
            .slice(1)
            .map((c) => c.textContent),
        ),
    ).toEqual([
      ['85%', 'Sim', 'Cruzeiro'],
      ['38%', 'Não', 'Base'],
    ]);
  });

  it('says when there is no telemetry in the last 24 hours', async () => {
    detail();
    expect(await screen.findByText('Sem telemetria nas últimas 24 h')).toBeInTheDocument();
  });
});

describe('robot actions', () => {
  it.each([
    ['operator_admin', ['Salvar', 'Trocar local', 'Revogar']],
    ['operator_staff', ['Salvar', 'Trocar local']],
  ] as const)('%s sees the actions its permissions allow', async (role, buttons) => {
    detail({ role });
    const actions = within(await screen.findByRole('region', { name: 'Ações' }));
    expect(actions.getAllByRole('button').map((b) => b.textContent)).toEqual(buttons);
  });

  it('shows no action at all to a client user', async () => {
    detail({ role: 'client_admin' });
    expect(await screen.findByRole('heading', { name: 'Robô Alfa' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Ações' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revogar' })).not.toBeInTheDocument();
  });

  it('renames the robot', async () => {
    const { robots } = detail();
    const user = userEvent.setup();
    const name = await screen.findByRole('textbox', { name: 'Nome' });

    await user.clear(name);
    await user.type(name, '  Robô Piso L2 ');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('heading', { name: 'Robô Piso L2' })).toBeInTheDocument();
    expect(robots.calls.renames).toEqual([{ name: 'Robô Piso L2' }]);
    expect(screen.getByText('Nome salvo.')).toBeInTheDocument();
  });

  it.each([
    [403, 'Você não tem permissão pra esta ação.'],
    [404, 'Este robô (ou local) não existe mais ou saiu do seu acesso.'],
  ])('explains a %i on rename', async (status, message) => {
    const { robots } = detail();
    const user = userEvent.setup();
    const name = await screen.findByRole('textbox', { name: 'Nome' });
    robots.fail.next = { status };

    await user.type(name, ' 2');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('moves the robot to a site of another client', async () => {
    const { robots } = detail();
    const user = userEvent.setup();
    const select = await screen.findByRole('combobox', { name: 'Local' });
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(2));

    await user.selectOptions(select, SITE_B);
    await user.click(screen.getByRole('button', { name: 'Trocar local' }));

    expect(await screen.findByText('Local trocado.')).toBeInTheDocument();
    expect(robots.calls.moves).toEqual([{ siteId: SITE_B }]);
    const now = within(screen.getByRole('region', { name: 'Agora' }));
    expect(now.getByText('Shopping Beta')).toBeInTheDocument();
    expect(now.getByText('Beta - Piso L2')).toBeInTheDocument();
    expect(robots.robots.find((r) => r.id === ROBOT_A)?.clientId).toBe(CLIENT_B);
  });

  it('revokes only after the dialog explains it, with focus kept inside and Esc to cancel', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const alert = vi.spyOn(window, 'alert');
    const { robots } = detail();
    const user = userEvent.setup();
    const revoke = await screen.findByRole('button', { name: 'Revogar' });

    await user.click(revoke);
    let dialog = screen.getByRole('dialog', { name: 'Revogar Robô Alfa?' });
    expect(dialog).toHaveAccessibleDescription(
      'O robô para de falar com a nuvem e precisa ser pareado de novo.',
    );
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Revogar' })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'Revogar' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(revoke).toHaveFocus();
    expect(robots.calls.revokes).toBe(0);

    await user.click(revoke);
    dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Revogar' }));

    expect(await screen.findByText('Robô revogado.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Agora' })).getByText('Revogado'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revogar' })).not.toBeInTheDocument();
    expect(robots.calls.revokes).toBe(1);
    expect(confirm).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it('keeps the dialog open with the error when the revoke fails', async () => {
    const { robots } = detail();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Revogar' }));
    robots.fail.next = { status: 403 };

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revogar' }));

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
      'Você não tem permissão pra esta ação.',
    );
  });
});
