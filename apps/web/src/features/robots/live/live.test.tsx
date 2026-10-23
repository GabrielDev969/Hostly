import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import PanelLayout from '@/app/(panel)/layout';
import RobotsLayout from '@/app/(panel)/robots/layout';
import { RobotDetail } from '../robot-detail';
import { RobotsList } from '../robots-list';
import { LiveRobotsProvider } from './live-robots';
import { type RoleName } from '../../../../test/fixtures';
import { ACCESS_TOKEN, panelHandlers } from '../../../../test/handlers';
import { setLocation } from '../../../../test/navigation';
import { renderWithSession } from '../../../../test/render';
import {
  liveSocket,
  presenceEvent,
  ROBOT_A,
  robotsApi,
  telemetryEvent,
} from '../../../../test/robots';
import { server } from '../../../../test/server';

const pause = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

function renderLive(
  page: ReactElement,
  {
    role = 'operator_admin',
    path = '/robots',
    delay = () => 20,
    tickets,
    strict = false,
  }: {
    role?: RoleName;
    path?: string;
    delay?: (attempt: number) => number;
    tickets?: number[];
    strict?: boolean;
  } = {},
) {
  const session = panelHandlers(role);
  const robots = robotsApi(role, { tickets });
  const live = liveSocket();
  server.use(...session.handlers, ...robots.handlers, live.handler);
  setLocation(path);
  const ui = (
    <PanelLayout>
      <LiveRobotsProvider delay={delay}>{page}</LiveRobotsProvider>
    </PanelLayout>
  );
  const rendered = renderWithSession(strict ? <StrictMode>{ui}</StrictMode> : ui);
  return { ...rendered, session, robots, live };
}

async function rowOf(name: string) {
  const link = await screen.findByRole('link', { name });
  return within(link.closest('tr')!);
}

// Open, and the REST reload that every open triggers has landed.
async function connected(live: ReturnType<typeof liveSocket>) {
  await waitFor(() => expect(live.open()).toHaveLength(1));
  await pause(50);
}

describe('live channel', () => {
  it('changes the battery on the list without reloading it', async () => {
    const { live, robots } = renderLive(<RobotsList />);
    const row = await rowOf('Robô Alfa');
    expect(row.getByText('80%')).toBeInTheDocument();
    await connected(live);
    const reloads = robots.calls.list.length;

    live.send(telemetryEvent(ROBOT_A, 61));

    expect(await row.findByText('61%')).toBeInTheDocument();
    await pause(50);
    expect(robots.calls.list).toHaveLength(reloads);
  });

  it('changes the battery, position and last contact on the detail', async () => {
    const { live } = renderLive(<RobotDetail robotId={ROBOT_A} />, { path: `/robots/${ROBOT_A}` });
    expect(await screen.findByText('80%')).toBeInTheDocument();
    await connected(live);

    live.send(telemetryEvent(ROBOT_A, 42, { pose: { x: 7, y: 8, theta: Math.PI } }));

    expect(await screen.findByText('42%')).toBeInTheDocument();
    expect(screen.getByText('7,00 m')).toBeInTheDocument();
    expect(screen.getByText('180°')).toBeInTheDocument();
    expect(screen.getByText(/^(agora|há \d s)$/)).toBeInTheDocument();
  });

  it('turns a robot offline and back online live', async () => {
    const { live } = renderLive(<RobotsList />);
    const row = await rowOf('Robô Alfa');
    await connected(live);

    live.send(presenceEvent('robot.offline', ROBOT_A));
    expect(await row.findByText('Offline')).toBeInTheDocument();

    live.send(presenceEvent('robot.online', ROBOT_A));
    expect(await row.findByText('Online')).toBeInTheDocument();
  });

  it('ignores broken JSON, an unknown type and an invalid payload, and keeps applying valid events', async () => {
    const { live } = renderLive(<RobotsList />);
    const row = await rowOf('Robô Alfa');
    await connected(live);

    live.send('{not json');
    live.send(
      JSON.stringify({ type: 'robot.renamed', sentAt: new Date().toISOString(), payload: {} }),
    );
    live.send(JSON.stringify({ ...telemetryEvent(ROBOT_A, 10), payload: { robotId: ROBOT_A } }));
    live.send(JSON.stringify(telemetryEvent(ROBOT_A, 150)));
    await pause(50);
    expect(row.getByText('80%')).toBeInTheDocument();

    live.send(telemetryEvent(ROBOT_A, 33));
    expect(await row.findByText('33%')).toBeInTheDocument();
    expect(live.open()).toHaveLength(1);
  });

  it('opens the socket with the ticket only in the subprotocol, never in the URL', async () => {
    const { live } = renderLive(<RobotsList />);
    await connected(live);

    const [connection] = live.connections;
    expect(connection!.url).toBe('ws://api.test/api/v1/live/socket');
    expect(connection!.protocols).toEqual(['hostly.live.v1', `ticket.${'1'.padStart(64, '0')}`]);
    expect(connection!.url).not.toContain(ACCESS_TOKEN);
    expect(connection!.protocols.join(' ')).not.toContain(ACCESS_TOKEN);
  });

  it('gets a new ticket and reconnects at once when the connection expires (4401)', async () => {
    // A backoff this long would fail the test: 4401 must not wait for it.
    const { live, robots } = renderLive(<RobotsList />, { delay: () => 60_000 });
    await connected(live);

    live.close(4401);

    await waitFor(() => expect(live.connections).toHaveLength(2));
    expect(robots.calls.tickets).toBe(2);
    expect(live.connections[1]!.protocols[1]).toBe(`ticket.${'2'.padStart(64, '0')}`);
    expect(screen.queryByText(/Ao vivo desconectado/)).not.toBeInTheDocument();
  });

  it('shows the notice on a drop, keeps the last state, reconnects with backoff and reloads over REST', async () => {
    const delays: number[] = [];
    const { live, robots } = renderLive(<RobotsList />, {
      delay: (attempt) => {
        delays.push(attempt);
        return 300;
      },
    });
    const row = await rowOf('Robô Alfa');
    await connected(live);
    live.send(telemetryEvent(ROBOT_A, 55));
    expect(await row.findByText('55%')).toBeInTheDocument();
    const reloads = robots.calls.list.length;

    live.close(1011);

    expect(await screen.findByText('Ao vivo desconectado, reconectando…')).toBeInTheDocument();
    expect(row.getByText('55%')).toBeInTheDocument();
    expect(live.connections).toHaveLength(1);

    await waitFor(() => expect(live.open()).toHaveLength(1));
    expect(live.connections).toHaveLength(2);
    await waitFor(() =>
      expect(screen.queryByText('Ao vivo desconectado, reconectando…')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(robots.calls.list.length).toBeGreaterThan(reloads));
    expect(delays).toEqual([0]);
  });

  it('backs off on a throttled or failing ticket request (429, 503) and connects after', async () => {
    const delays: number[] = [];
    const { live, robots } = renderLive(<RobotsList />, {
      tickets: [429, 503],
      delay: (attempt) => {
        delays.push(attempt);
        return 20;
      },
    });

    await waitFor(() => expect(live.open()).toHaveLength(1));
    expect(robots.calls.tickets).toBe(3);
    expect(delays).toEqual([0, 1]);
  });

  // On a 401 the session client renews the token and retries once, as for any request; then the channel stops.
  it.each([
    [401, 2],
    [403, 1],
  ])('stops for good when the ticket is refused with %i', async (status, requests) => {
    const { live, robots } = renderLive(<RobotsList />, { tickets: [status, status, status] });

    expect(
      await screen.findByText('Ao vivo indisponível. Recarregue a página para tentar de novo.'),
    ).toBeInTheDocument();
    await pause(100);
    expect(robots.calls.tickets).toBe(requests);
    expect(live.connections).toHaveLength(0);
  });

  it('closes the socket on logout and does not reconnect', async () => {
    const { live, robots } = renderLive(<RobotsList />);
    await connected(live);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(live.connections[0]!.closed).toBe(true));
    await pause(100);
    expect(live.connections).toHaveLength(1);
    expect(robots.calls.tickets).toBe(1);
  });

  it('opens a single socket under StrictMode, through the robots layout', async () => {
    const session = panelHandlers('operator_admin');
    const robots = robotsApi('operator_admin');
    const live = liveSocket();
    server.use(...session.handlers, ...robots.handlers, live.handler);
    setLocation('/robots');
    renderWithSession(
      <StrictMode>
        <PanelLayout>
          <RobotsLayout>
            <RobotsList />
          </RobotsLayout>
        </PanelLayout>
      </StrictMode>,
    );

    await connected(live);
    await pause(100);
    expect(live.open()).toHaveLength(1);
    expect(live.connections.filter((c) => !c.closed)).toHaveLength(1);
  });
});
