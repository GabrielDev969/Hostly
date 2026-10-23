import {
  LIVE_SOCKET_CLOSE,
  LIVE_SOCKET_PROTOCOL,
  LIVE_TICKET_PROTOCOL_PREFIX,
  liveEventSchema,
  type LiveEvent,
} from '@hostly/contracts';
import { ApiError } from '@/lib/api/errors';
import { MissingConfigError } from '@/lib/env';
import { backoffDelay } from './backoff';

// connecting: first connection or a ticket renewal (4401); reconnecting: after a drop, waiting out the backoff;
// unavailable: the API refused the ticket for good (401 or 403), so it does not try again.
export type LiveStatus = 'connecting' | 'open' | 'reconnecting' | 'unavailable';

export interface LiveConnectionDeps {
  // A single-use ticket from POST /live/tickets; the access token stays in the session client.
  requestTicket: (signal: AbortSignal) => Promise<string>;
  url: () => string;
  onEvent: (event: LiveEvent) => void;
  onOpen: () => void;
  onStatus: (status: LiveStatus) => void;
  delay?: (attempt: number) => number;
}

// Malformed JSON, an unknown type and an invalid payload are all ignored, without logging what came.
export function parseLiveEvent(data: unknown): LiveEvent | null {
  if (typeof data !== 'string') return null;
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  const parsed = liveEventSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// Retrying will not help: the session is gone (the session client already tried a refresh), the role cannot
// watch, or the panel has no API URL.
function isFinal(error: unknown): boolean {
  if (error instanceof MissingConfigError) return true;
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

// The panel's side of the live channel. The ticket goes only in the subprotocol, never in the URL, and the panel
// never sends anything. stop() is final: nothing opens or reschedules after it.
export class LiveConnection {
  private stopped = false;
  private socket: WebSocket | null = null;
  private abort: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;

  constructor(private readonly deps: LiveConnectionDeps) {}

  start(): void {
    this.deps.onStatus('connecting');
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.abort?.abort();
    this.abort = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000);
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const abort = new AbortController();
    this.abort = abort;
    let ticket: string;
    try {
      ticket = await this.deps.requestTicket(abort.signal);
    } catch (error) {
      if (this.stopped) return;
      if (isFinal(error)) {
        this.stopped = true;
        this.deps.onStatus('unavailable');
      } else {
        this.retry();
      }
      return;
    } finally {
      if (this.abort === abort) this.abort = null;
    }
    if (this.stopped) return;

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.deps.url(), [
        LIVE_SOCKET_PROTOCOL,
        `${LIVE_TICKET_PROTOCOL_PREFIX}${ticket}`,
      ]);
    } catch {
      this.retry();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      // Fail closed: a server that did not pick our protocol is not the live channel.
      if (socket.protocol !== LIVE_SOCKET_PROTOCOL) {
        socket.close(1000);
        return;
      }
      this.attempt = 0;
      this.deps.onStatus('open');
      this.deps.onOpen();
    };
    socket.onmessage = (message: MessageEvent) => {
      if (this.socket !== socket) return;
      const event = parseLiveEvent(message.data);
      if (event) this.deps.onEvent(event);
    };
    socket.onclose = (event: CloseEvent) => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.stopped) return;
      if (event.code === LIVE_SOCKET_CLOSE.expired) {
        // The connection reached its lifetime: a new ticket right away, no backoff.
        this.attempt = 0;
        this.deps.onStatus('connecting');
        void this.connect();
      } else {
        this.retry();
      }
    };
  }

  private retry(): void {
    this.deps.onStatus('reconnecting');
    const wait = (this.deps.delay ?? backoffDelay)(this.attempt);
    this.attempt += 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.connect();
    }, wait);
  }
}
