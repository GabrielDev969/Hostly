import { ROBOT_SOCKET_CLOSE } from '@hostly/contracts';
import { RobotConnection, type RobotSocket } from './robot-connection';
import type { RobotSession } from './robot-scope.service';

const session: RobotSession = {
  robotId: 'r1',
  serial: 'LB-01',
  organizationId: 'o1',
  workspaceId: 'w1',
  deviceTokenHash: 'hash',
};

describe('RobotConnection', () => {
  let socket: jest.Mocked<RobotSocket>;
  let connection: RobotConnection;

  const pings = () =>
    socket.send.mock.calls
      .map(([data]) => JSON.parse(data) as { type: string; id: string })
      .filter((message) => message.type === 'ping');

  beforeEach(() => {
    jest.useFakeTimers();
    socket = { send: jest.fn(), close: jest.fn(), terminate: jest.fn() };
    connection = new RobotConnection(session, socket, {
      pingIntervalMs: 30_000,
      missedPings: 3,
      helloTimeoutMs: 10_000,
      messagesPerInterval: 3,
    });
    connection.start();
  });

  afterEach(() => {
    connection.stop();
    jest.useRealTimers();
  });

  it('closes when no hello arrives in time', () => {
    jest.advanceTimersByTime(10_000);
    expect(socket.close).toHaveBeenCalledWith(ROBOT_SOCKET_CLOSE.helloTimeout, 'hello timeout');
  });

  it('keeps the socket once the hello arrived', () => {
    connection.acceptHello();
    jest.advanceTimersByTime(10_000);
    expect(socket.close).not.toHaveBeenCalled();
  });

  it('pings every interval and drops the socket on the third ping without a pong', () => {
    connection.acceptHello();
    jest.advanceTimersByTime(30_000 * 3);
    expect(pings()).toHaveLength(3);
    expect(socket.terminate).not.toHaveBeenCalled();

    jest.advanceTimersByTime(30_000);
    expect(socket.terminate).toHaveBeenCalledTimes(1);
  });

  it('counts misses again from zero after a matching pong', () => {
    connection.acceptHello();
    jest.advanceTimersByTime(30_000 * 3);
    expect(connection.pong('not-the-ping')).toBe(false);
    expect(connection.pong(pings().at(-1)!.id)).toBe(true);

    jest.advanceTimersByTime(30_000 * 3);
    expect(socket.terminate).not.toHaveBeenCalled();
    jest.advanceTimersByTime(30_000);
    expect(socket.terminate).toHaveBeenCalled();
  });

  it('closes past the message limit of an interval and resets it every interval', () => {
    connection.acceptHello();
    expect([connection.admit(), connection.admit(), connection.admit()]).toEqual([
      true,
      true,
      true,
    ]);
    jest.advanceTimersByTime(30_000);
    expect(connection.admit()).toBe(true);
    connection.admit();
    connection.admit();
    expect(connection.admit()).toBe(false);
    expect(socket.close).toHaveBeenCalledWith(ROBOT_SOCKET_CLOSE.rateLimited, 'too many messages');
  });

  it('admits nothing once the cloud started closing or dropped the socket', () => {
    connection.close(ROBOT_SOCKET_CLOSE.unauthorized, 'token no longer valid');
    expect(connection.closing).toBe(true);
    expect(connection.admit()).toBe(false);
  });

  it('marks the connection closing when the heartbeat drops it', () => {
    connection.acceptHello();
    jest.advanceTimersByTime(30_000 * 4);
    expect(socket.terminate).toHaveBeenCalled();
    expect(connection.admit()).toBe(false);
  });

  it('tracks the hello from waiting to pending to accepted', () => {
    expect(connection.hello).toBe('waiting');
    connection.beginHello();
    expect(connection.hello).toBe('pending');
    connection.acceptHello();
    expect(connection.hello).toBe('accepted');
  });
});
