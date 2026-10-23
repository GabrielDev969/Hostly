import type { IncomingMessage } from 'http';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayInit, WebSocketGateway } from '@nestjs/websockets';
import type { VerifyClientCallbackAsync, WebSocket, WebSocketServer } from 'ws';
import {
  LIVE_SOCKET_CLOSE,
  LIVE_SOCKET_PATH,
  LIVE_SOCKET_PROTOCOL,
  LIVE_TICKET_PROTOCOL_PREFIX,
} from '@hostly/contracts';
import { env } from 'src/config/env.config';
import { corsOrigins } from 'src/config/cors.config';
import { LiveViewer } from '../entities/live-viewer.entity';
import { canSee, LiveEventBus, RobotLiveEvent } from '../services/live-event-bus';
import { RedeemLiveTicketUseCase } from '../use-cases/redeem-live-ticket.use-case';

const HEARTBEAT_MS = 30_000;

interface Viewing {
  viewer: LiveViewer;
  alive: boolean;
  expiry: NodeJS.Timeout;
}

function offeredProtocols(req: IncomingMessage): string[] {
  return (req.headers['sec-websocket-protocol'] ?? '')
    .split(',')
    .map((protocol) => protocol.trim())
    .filter(Boolean);
}

// The panel's live channel: status of the robots in the viewer's scope. The panel sends nothing.
// The ticket arrives as a subprotocol, so it never shows in a URL or in the HTTP log.
@WebSocketGateway({ path: LIVE_SOCKET_PATH, maxPayload: 4096 })
export class LiveGateway
  implements OnGatewayInit<WebSocketServer>, OnGatewayConnection<WebSocket>, OnModuleDestroy
{
  private readonly logger = new Logger('LiveGateway');
  private readonly pendingViewers = new WeakMap<IncomingMessage, LiveViewer>();
  private readonly viewings = new Map<WebSocket, Viewing>();
  private unsubscribe?: () => void;
  private heartbeat?: NodeJS.Timeout;

  constructor(
    private readonly events: LiveEventBus,
    private readonly redeemTicket: RedeemLiveTicketUseCase,
  ) {}

  afterInit(server: WebSocketServer): void {
    // Set here and not in the decorator, which has no access to the injected use case.
    const verifyClient: VerifyClientCallbackAsync<IncomingMessage> = (info, done) => {
      this.verify(info.req, info.origin).then(
        (status) => (status === null ? done(true) : done(false, status)),
        () => done(false, 503),
      );
    };
    server.options.verifyClient = verifyClient;
    server.options.handleProtocols = (protocols) =>
      protocols.has(LIVE_SOCKET_PROTOCOL) ? LIVE_SOCKET_PROTOCOL : false;

    this.unsubscribe = this.events.subscribe((event) => this.broadcast(event));
    this.heartbeat = setInterval(() => this.checkAlive(), HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  handleConnection(socket: WebSocket, req: IncomingMessage): void {
    const viewer = this.pendingViewers.get(req);
    if (!viewer) {
      socket.terminate();
      return;
    }
    const expiry = setTimeout(
      () => socket.close(LIVE_SOCKET_CLOSE.expired, 'expired'),
      env.LIVE_SOCKET_MAX_AGE_MS,
    );
    const viewing: Viewing = { viewer, alive: true, expiry };
    this.viewings.set(socket, viewing);
    socket.on('pong', () => (viewing.alive = true));
    socket.on('close', () => {
      clearTimeout(expiry);
      this.viewings.delete(socket);
    });
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    clearInterval(this.heartbeat);
    for (const [socket, viewing] of this.viewings) {
      clearTimeout(viewing.expiry);
      socket.close(1001, 'server shutting down');
    }
  }

  // Null when accepted, otherwise the HTTP status of the refusal.
  private async verify(req: IncomingMessage, origin: string | undefined): Promise<number | null> {
    if (!origin || !corsOrigins.includes(origin)) return 403;
    const ticket = offeredProtocols(req)
      .find((protocol) => protocol.startsWith(LIVE_TICKET_PROTOCOL_PREFIX))
      ?.slice(LIVE_TICKET_PROTOCOL_PREFIX.length);
    if (!ticket) return 401;
    const viewer = await this.redeemTicket.execute(ticket);
    if (!viewer) return 401;
    this.pendingViewers.set(req, viewer);
    return null;
  }

  private broadcast(event: RobotLiveEvent): void {
    const message = JSON.stringify(event.event);
    for (const [socket, viewing] of this.viewings) {
      if (canSee(viewing.viewer, event)) socket.send(message);
    }
  }

  // Protocol pings (the browser answers them by itself) drop panels that vanished without closing.
  private checkAlive(): void {
    for (const [socket, viewing] of this.viewings) {
      if (!viewing.alive) {
        this.logger.debug({
          msg: 'Dropping unresponsive panel socket',
          userId: viewing.viewer.userId,
        });
        socket.terminate();
        continue;
      }
      viewing.alive = false;
      socket.ping();
    }
  }
}
