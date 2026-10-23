import { randomUUID } from 'crypto';
import { ROBOT_SOCKET_CLOSE, type CloudToRobotMessage } from '@hostly/contracts';
import type { RobotSession } from './robot-scope.service';

// The part of a ws socket a connection drives; a fake in the unit tests.
export interface RobotSocket {
  send(data: string): void;
  close(code: number, reason: string): void;
  terminate(): void;
}

export interface RobotConnectionOptions {
  pingIntervalMs: number;
  missedPings: number;
  helloTimeoutMs: number;
  // Per ping interval; the normal load is about five (three telemetry, a pong and a ping).
  messagesPerInterval: number;
}

export const MESSAGES_PER_PING_INTERVAL = 20;

// waiting: nothing yet; pending: a hello arrived and its token is being checked again; accepted: the robot's
// connection of record.
export type HelloState = 'waiting' | 'pending' | 'accepted';

// The timers of one robot socket: the hello deadline, the ping/pong heartbeat and the message limit.
export class RobotConnection {
  hello: HelloState = 'waiting';
  // Set once the cloud closes or drops the socket. ws still delivers messages while a close handshake is in
  // flight, and none of them may touch the robot's state.
  closing = false;
  private pendingPingId: string | null = null;
  private missed = 0;
  private received = 0;
  private helloTimer?: NodeJS.Timeout;
  private pingTimer?: NodeJS.Timeout;
  private windowTimer?: NodeJS.Timeout;

  constructor(
    readonly session: RobotSession,
    private readonly socket: RobotSocket,
    private readonly options: RobotConnectionOptions,
  ) {}

  start(): void {
    this.helloTimer = setTimeout(
      () => this.close(ROBOT_SOCKET_CLOSE.helloTimeout, 'hello timeout'),
      this.options.helloTimeoutMs,
    );
    this.windowTimer = setInterval(() => (this.received = 0), this.options.pingIntervalMs);
  }

  // Counts one message; false when the socket is closing or (and then it closes) over the limit.
  admit(): boolean {
    if (this.closing) return false;
    this.received += 1;
    if (this.received <= this.options.messagesPerInterval) return true;
    this.close(ROBOT_SOCKET_CLOSE.rateLimited, 'too many messages');
    return false;
  }

  beginHello(): void {
    this.hello = 'pending';
  }

  acceptHello(): void {
    this.hello = 'accepted';
    clearTimeout(this.helloTimer);
    this.pingTimer = setInterval(() => this.heartbeat(), this.options.pingIntervalMs);
  }

  // True when the pong answers the ping in flight.
  pong(id: string): boolean {
    if (id !== this.pendingPingId) return false;
    this.pendingPingId = null;
    this.missed = 0;
    return true;
  }

  send(message: CloudToRobotMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  close(code: number, reason: string): void {
    this.closing = true;
    this.stop();
    this.socket.close(code, reason);
  }

  stop(): void {
    clearTimeout(this.helloTimer);
    clearInterval(this.pingTimer);
    clearInterval(this.windowTimer);
  }

  // A robot that vanished without closing gets no close frame: after the last missed ping the socket is dropped.
  private heartbeat(): void {
    if (this.pendingPingId) {
      this.missed += 1;
      if (this.missed >= this.options.missedPings) {
        this.closing = true;
        this.stop();
        this.socket.terminate();
        return;
      }
    }
    this.pendingPingId = randomUUID();
    this.send({
      type: 'ping',
      id: this.pendingPingId,
      sentAt: new Date().toISOString(),
      payload: {},
    });
  }
}
