// The panel's live channel (cloud → panel). The browser cannot send headers on a WebSocket and the ticket must not
// go in the URL, so it travels as a second subprotocol: new WebSocket(url, [LIVE_SOCKET_PROTOCOL, `ticket.${ticket}`]).
export const LIVE_SOCKET_PATH = '/api/v1/live/socket';

export const LIVE_SOCKET_PROTOCOL = 'hostly.live.v1';

export const LIVE_TICKET_PROTOCOL_PREFIX = 'ticket.';

export const LIVE_SOCKET_CLOSE = {
  // The connection reached its lifetime: get a new ticket and reconnect.
  expired: 4401,
} as const;
