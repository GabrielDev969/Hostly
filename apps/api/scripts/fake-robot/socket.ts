import WebSocket from 'ws';
import {
  CONTRACT_VERSION,
  ROBOT_SOCKET_AUTH,
  ROBOT_SOCKET_PATH,
  helloMessageSchema,
  parseCloudMessage,
  telemetryMessageSchema,
  type CloudToRobotMessage,
  type HelloPayload,
  type TelemetryPayload,
} from '@hostly/contracts';

export interface ConnectRobotOptions {
  // http(s) or ws(s) base URL of the API.
  api: string;
  deviceToken: string;
  serial: string;
  // Sends the hello as soon as the socket opens (the default).
  hello?: boolean;
}

export interface SocketClosed {
  code: number;
  reason: string;
}

export class SocketRefusedError extends Error {
  constructor(readonly status: number) {
    super(`The cloud refused the socket with HTTP ${status}`);
  }
}

// The robot side of the cloud socket, as the app does it: token in the Authorization header, hello first,
// telemetry on demand and a pong for every ping. Outgoing messages are checked against @hostly/contracts.
export interface RobotLink {
  sendHello(overrides?: Partial<HelloPayload>): void;
  sendTelemetry(payload?: TelemetryPayload): void;
  sendRaw(data: string): void;
  // Closes cleanly (1000).
  close(): void;
  // Stops answering and sending without closing: a robot that lost the network.
  vanish(): void;
  // Answers and sends again, as if the network came back before the cloud gave up on it.
  reappear(): void;
  readonly received: CloudToRobotMessage[];
  readonly closed: Promise<SocketClosed>;
}

const now = () => new Date().toISOString();

// A robot cruising in a circle while its battery drains, one step per telemetry.
export function simulatedTelemetry(step: number): TelemetryPayload {
  const angle = (step % 36) * (Math.PI / 18);
  return {
    battery: Math.max(5, 100 - Math.floor(step / 6)),
    charging: false,
    pose: { x: 2 * Math.cos(angle), y: 2 * Math.sin(angle), theta: angle + Math.PI / 2 },
    mode: 'cruise',
    nowPlaying: null,
    emergency: false,
  };
}

export function socketUrl(api: string): string {
  const url = new URL(ROBOT_SOCKET_PATH, api);
  url.protocol = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:';
  return url.toString();
}

export function connectRobot(options: ConnectRobotOptions): Promise<RobotLink> {
  const socket = new WebSocket(socketUrl(options.api), {
    headers: { [ROBOT_SOCKET_AUTH.header]: `${ROBOT_SOCKET_AUTH.scheme} ${options.deviceToken}` },
  });
  const received: CloudToRobotMessage[] = [];
  let vanished = false;
  let step = 0;

  const send = (message: unknown) => {
    if (!vanished && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  const closed = new Promise<SocketClosed>((resolve) => {
    socket.on('close', (code, reason) => resolve({ code, reason: reason.toString() }));
  });

  socket.on('message', (data: Buffer) => {
    const parsed = parseCloudMessage(JSON.parse(data.toString('utf8')) as unknown);
    if (parsed.kind !== 'ok') return;
    received.push(parsed.message);
    if (parsed.message.type === 'ping') {
      send({ type: 'pong', id: parsed.message.id, sentAt: now(), payload: {} });
    }
  });

  const link: RobotLink = {
    sendHello: (overrides = {}) =>
      send(
        helloMessageSchema.parse({
          type: 'hello',
          sentAt: now(),
          payload: {
            serial: options.serial,
            appVersion: '0.1.0-fake',
            romVersion: 'fake-rom-1',
            manifestVersion: null,
            contractVersion: CONTRACT_VERSION,
            ...overrides,
          },
        }),
      ),
    sendTelemetry: (payload = simulatedTelemetry(step++)) =>
      send(telemetryMessageSchema.parse({ type: 'telemetry', sentAt: now(), payload })),
    sendRaw: (data) => socket.send(data),
    close: () => socket.close(1000, 'bye'),
    vanish: () => {
      vanished = true;
    },
    reappear: () => {
      vanished = false;
    },
    received,
    closed,
  };

  return new Promise((resolve, reject) => {
    socket.once('unexpected-response', (_req, res) => {
      reject(new SocketRefusedError(res.statusCode ?? 0));
      socket.terminate();
    });
    // Before the open it fails the connect; after it, the close event tells the rest.
    socket.on('error', reject);
    socket.once('open', () => {
      if (options.hello ?? true) link.sendHello();
      resolve(link);
    });
  });
}
