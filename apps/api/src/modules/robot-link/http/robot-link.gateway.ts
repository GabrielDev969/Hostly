import type { IncomingMessage } from 'http';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayInit, WebSocketGateway } from '@nestjs/websockets';
import type { RawData, VerifyClientCallbackAsync, WebSocket, WebSocketServer } from 'ws';
import type { Subscription } from 'rxjs';
import {
  CONTRACT_VERSION,
  ROBOT_SOCKET_AUTH,
  ROBOT_SOCKET_CLOSE,
  ROBOT_SOCKET_MAX_MESSAGE_BYTES,
  ROBOT_SOCKET_PATH,
  parseRobotMessage,
  type HelloPayload,
  type RobotToCloudMessage,
} from '@hostly/contracts';
import { env } from 'src/config/env.config';
import { RobotAuthService } from '@modules/robots/services/robot-auth.service';
import {
  RobotTokenEvents,
  type RobotTokenChange,
} from '@modules/robots/services/robot-token-events.service';
import { CryptoUtil } from '@shared/utils/crypto.util';
import { MESSAGES_PER_PING_INTERVAL, RobotConnection } from '../services/robot-connection';
import { RobotConnectionRegistry } from '../services/robot-connection-registry';
import type { RobotSession } from '../services/robot-scope.service';
import { RecordRobotHelloUseCase } from '../use-cases/record-robot-hello.use-case';
import { RecordTelemetryUseCase } from '../use-cases/record-telemetry.use-case';
import { TouchRobotUseCase } from '../use-cases/touch-robot.use-case';
import { MarkRobotOfflineUseCase } from '../use-cases/mark-robot-offline.use-case';

const BEARER = `${ROBOT_SOCKET_AUTH.scheme} `;

function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers[ROBOT_SOCKET_AUTH.header];
  return typeof header === 'string' && header.startsWith(BEARER)
    ? header.slice(BEARER.length).trim() || null
    : null;
}

function textOf(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  return (Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data)).toString('utf8');
}

// The robot's line to the cloud. The token is checked before the upgrade, so a refused robot gets HTTP 401 and
// no socket; logs carry the robot id and close codes only, never the token or the request.
@WebSocketGateway({ path: ROBOT_SOCKET_PATH, maxPayload: ROBOT_SOCKET_MAX_MESSAGE_BYTES })
export class RobotLinkGateway
  implements OnGatewayInit<WebSocketServer>, OnGatewayConnection<WebSocket>, OnModuleDestroy
{
  private readonly logger = new Logger('RobotLink');
  private readonly pendingSessions = new WeakMap<IncomingMessage, RobotSession>();
  private readonly connections = new Set<RobotConnection>();
  // Presence writes of one robot run one after the other, so a close and a reconnect never cross in the database.
  private readonly writes = new Map<string, Promise<void>>();
  private tokenChanges?: Subscription;
  private shuttingDown = false;

  constructor(
    private readonly auth: RobotAuthService,
    private readonly tokenEvents: RobotTokenEvents,
    private readonly registry: RobotConnectionRegistry,
    private readonly recordHello: RecordRobotHelloUseCase,
    private readonly recordTelemetry: RecordTelemetryUseCase,
    private readonly touchRobot: TouchRobotUseCase,
    private readonly markOffline: MarkRobotOfflineUseCase,
  ) {}

  afterInit(server: WebSocketServer): void {
    // Set here and not in the decorator, which has no access to the injected services.
    const verifyClient: VerifyClientCallbackAsync<IncomingMessage> = (info, done) => {
      this.verify(info.req).then(
        (accepted) => (accepted ? done(true) : done(false, 401)),
        () => done(false, 503),
      );
    };
    server.options.verifyClient = verifyClient;
    this.tokenChanges = this.tokenEvents.changes.subscribe((change) => this.onTokenChange(change));
  }

  handleConnection(socket: WebSocket, req: IncomingMessage): void {
    const session = this.pendingSessions.get(req);
    if (!session) {
      socket.terminate();
      return;
    }
    const connection = new RobotConnection(session, socket, {
      pingIntervalMs: env.ROBOT_SOCKET_PING_INTERVAL_MS,
      missedPings: env.ROBOT_SOCKET_MISSED_PINGS,
      helloTimeoutMs: env.ROBOT_SOCKET_HELLO_TIMEOUT_MS,
      messagesPerInterval: MESSAGES_PER_PING_INTERVAL,
    });
    this.connections.add(connection);
    connection.start();
    socket.on('message', (data, isBinary) => this.onMessage(connection, data, isBinary));
    socket.on('close', (code) => this.onClose(connection, code));
  }

  // Writes already queued finish before the database goes away; offline is left to the stale sweep.
  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    this.tokenChanges?.unsubscribe();
    for (const connection of this.connections) connection.close(1001, 'server shutting down');
    await Promise.all(this.writes.values());
  }

  private async verify(req: IncomingMessage): Promise<boolean> {
    const token = bearerToken(req);
    if (!token) return false;
    const deviceTokenHash = CryptoUtil.hashToken(token);
    const robot = await this.auth.authenticateHash(deviceTokenHash);
    if (!robot) return false;
    const workspaceId = await this.auth.operatorWorkspaceId(robot.organizationId);
    if (!workspaceId) return false;
    this.pendingSessions.set(req, {
      robotId: robot.id,
      serial: robot.serial,
      organizationId: robot.organizationId,
      workspaceId,
      deviceTokenHash,
    });
    return true;
  }

  // Unknown types and broken messages are logged and dropped; the connection stays up.
  private onMessage(connection: RobotConnection, data: RawData, isBinary: boolean): void {
    if (!connection.admit()) return;
    const robotId = connection.session.robotId;
    let raw: unknown;
    try {
      raw = isBinary ? undefined : (JSON.parse(textOf(data)) as unknown);
    } catch {
      raw = undefined;
    }
    if (raw === undefined) {
      this.logger.warn({ msg: 'Robot message is not JSON text', robotId });
      return;
    }
    const parsed = parseRobotMessage(raw);
    if (parsed.kind === 'unknown') {
      this.logger.warn({ msg: 'Unknown robot message type', robotId, type: parsed.type });
      return;
    }
    if (parsed.kind === 'invalid') {
      this.logger.warn({
        msg: 'Invalid robot message',
        robotId,
        issues: parsed.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code })),
      });
      return;
    }
    this.handle(connection, parsed.message);
  }

  private handle(connection: RobotConnection, message: RobotToCloudMessage): void {
    const session = connection.session;
    if (message.type === 'hello') {
      if (!connection.helloReceived) this.onHello(connection, message.payload);
      return;
    }
    if (!connection.helloReceived) {
      this.logger.debug({ msg: 'Robot message before hello ignored', robotId: session.robotId });
      return;
    }
    switch (message.type) {
      case 'telemetry':
        this.write(connection, () => this.recordTelemetry.execute(session, message.payload));
        return;
      case 'ping':
        connection.send({
          type: 'pong',
          id: message.id,
          sentAt: new Date().toISOString(),
          payload: {},
        });
        return;
      case 'pong':
        if (connection.pong(message.id))
          this.write(connection, () => this.touchRobot.execute(session));
        return;
    }
  }

  private onHello(connection: RobotConnection, hello: HelloPayload): void {
    const session = connection.session;
    if (hello.serial !== session.serial) {
      this.logger.warn({ msg: 'Hello with another serial', robotId: session.robotId });
      connection.close(ROBOT_SOCKET_CLOSE.serialMismatch, 'serial mismatch');
      return;
    }
    if (hello.contractVersion !== CONTRACT_VERSION) {
      this.logger.warn({
        msg: 'Robot speaks another contract version',
        robotId: session.robotId,
        contractVersion: hello.contractVersion,
      });
      connection.close(ROBOT_SOCKET_CLOSE.contractMismatch, 'contract version mismatch');
      return;
    }
    connection.acceptHello();
    const previous = this.registry.register(session.robotId, connection);
    previous?.close(ROBOT_SOCKET_CLOSE.replaced, 'replaced by a newer connection');
    this.write(connection, () => this.recordHello.execute(session, hello));
  }

  private onClose(connection: RobotConnection, code: number): void {
    connection.stop();
    this.connections.delete(connection);
    const robotId = connection.session.robotId;
    this.logger.log({ msg: 'Robot socket closed', robotId, code });
    if (this.shuttingDown || !this.registry.unregister(robotId, connection)) return;
    this.serialize(robotId, () => this.markOffline.execute(connection.session));
  }

  // A revoked token, or one replaced by a new pairing, ends the sockets opened with it right away.
  private onTokenChange(change: RobotTokenChange): void {
    for (const connection of this.connections) {
      const session = connection.session;
      if (
        session.robotId === change.robotId &&
        session.deviceTokenHash !== change.activeTokenHash
      ) {
        connection.close(ROBOT_SOCKET_CLOSE.unauthorized, 'token no longer valid');
      }
    }
  }

  // Runs a robot write; a token found invalid on the way closes the socket.
  private write(connection: RobotConnection, task: () => Promise<boolean>): void {
    this.serialize(connection.session.robotId, async () => {
      if (!(await task())) {
        connection.close(ROBOT_SOCKET_CLOSE.unauthorized, 'token no longer valid');
      }
    });
  }

  private serialize(robotId: string, task: () => Promise<void>): void {
    const next = (this.writes.get(robotId) ?? Promise.resolve()).then(task).catch((error) => {
      this.logger.error({ msg: 'Robot write failed', robotId, error: (error as Error).message });
    });
    this.writes.set(robotId, next);
    void next.then(() => {
      if (this.writes.get(robotId) === next) this.writes.delete(robotId);
    });
  }
}
