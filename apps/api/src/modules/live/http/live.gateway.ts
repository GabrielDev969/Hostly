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
import {
  clientIp,
  HandshakeLimiter,
  SECRET_FORMAT,
  SOCKET_CLOSE_TIMEOUT_MS,
} from '@shared/websocket/handshake-guard';
import { LiveViewer } from '../entities/live-viewer.entity';
import { canSee, LiveEventBus, RobotLiveEvent } from '../services/live-event-bus';
import { RedeemLiveTicketUseCase } from '../use-cases/redeem-live-ticket.use-case';

const HEARTBEAT_MS = 30_000;
// Open panel sockets per user: a few tabs, not an unbounded fan-out.
export const MAX_SOCKETS_PER_USER = 5;
// The panel only listens; anything it sends is a policy violation.
const POLICY_VIOLATION = 1008;

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
@WebSocketGateway({
  path: LIVE_SOCKET_PATH,
  maxPayload: 4096,
  closeTimeout: SOCKET_CLOSE_TIMEOUT_MS,
})
export class LiveGateway
  implements OnGatewayInit<WebSocketServer>, OnGatewayConnection<WebSocket>, OnModuleDestroy
{
  private readonly logger = new Logger('LiveGateway');
  private readonly pendingViewers = new WeakMap<IncomingMessage, LiveViewer>();
  private readonly viewings = new Map<WebSocket, Viewing>();
  private readonly handshakes = new HandshakeLimiter();
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
    // verify() already counted, but two handshakes of the same user may have passed it together.
    if (this.socketsOf(viewer.userId) >= MAX_SOCKETS_PER_USER) {
      socket.close(POLICY_VIOLATION, 'too many live sockets');
      return;
    }
    const expiry = setTimeout(
      () => socket.close(LIVE_SOCKET_CLOSE.expired, 'expired'),
      env.LIVE_SOCKET_MAX_AGE_MS,
    );
    const viewing: Viewing = { viewer, alive: true, expiry };
    this.viewings.set(socket, viewing);
    socket.on('pong', () => (viewing.alive = true));
    socket.on('message', () => socket.close(POLICY_VIOLATION, 'the live socket is receive-only'));
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

  // Null when accepted, otherwise the HTTP status of the refusal. The upgrade bypasses Express and its throttler,
  // so a bad Origin, a malformed ticket or an IP with too many refusals stops here, before Redis is asked anything.
  // A blocked IP still gets a paced attempt through; what would be refused without I/O never spends it.
  private async verify(req: IncomingMessage, origin: string | undefined): Promise<number | null> {
    const ip = clientIp(req, env.TRUST_PROXY);
    const blocked = this.handshakes.isBlocked(ip);
    if (!origin || !corsOrigins.includes(origin)) {
      return blocked ? 429 : this.refuse(ip, 'origin not allowed', 403);
    }
    const ticket = offeredProtocols(req)
      .find((protocol) => protocol.startsWith(LIVE_TICKET_PROTOCOL_PREFIX))
      ?.slice(LIVE_TICKET_PROTOCOL_PREFIX.length);
    if (!ticket || !SECRET_FORMAT.test(ticket)) {
      return blocked ? 429 : this.refuse(ip, 'malformed ticket', 401);
    }
    if (blocked && !this.handshakes.admit(ip)) return 429;
    const viewer = await this.redeemTicket.execute(ticket);
    if (!viewer) return this.refuse(ip, 'unknown ticket', 401);
    if (this.socketsOf(viewer.userId) >= MAX_SOCKETS_PER_USER) return 429;
    this.pendingViewers.set(req, viewer);
    return null;
  }

  private refuse(ip: string, reason: string, status: number): number {
    this.logger.warn({ msg: 'Live socket refused', ip, reason });
    if (this.handshakes.recordRefusal(ip)) {
      this.logger.warn({ msg: 'Live socket handshakes blocked for a while', ip });
    }
    return status;
  }

  private socketsOf(userId: string): number {
    let count = 0;
    for (const viewing of this.viewings.values()) if (viewing.viewer.userId === userId) count += 1;
    return count;
  }

  private broadcast(event: RobotLiveEvent): void {
    const message = JSON.stringify(event.event);
    for (const [socket, viewing] of this.viewings) {
      if (socket.readyState === socket.OPEN && canSee(viewing.viewer, event)) socket.send(message);
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
