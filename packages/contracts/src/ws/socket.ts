// How the robot reaches the cloud socket. Constants only: none of them changes a message shape.
export const ROBOT_SOCKET_PATH = '/api/v1/device/socket';

// The device token goes in this header at the handshake, never in the URL. A refused token answers HTTP 401.
export const ROBOT_SOCKET_AUTH = { header: 'authorization', scheme: 'Bearer' } as const;

export const ROBOT_SOCKET_DEFAULTS = {
  pingIntervalMs: 30_000,
  // Pings in a row without a pong before the other side counts as gone (about 90 s).
  missedPings: 3,
  telemetryIntervalMs: 10_000,
  // The hello must arrive within this after the socket opens.
  helloTimeoutMs: 10_000,
} as const;

// Larger messages close the socket with 1009.
export const ROBOT_SOCKET_MAX_MESSAGE_BYTES = 16_384;

// Close codes the cloud sends besides the standard ones (1000 normal, 1001 going away, 1009 too big).
export const ROBOT_SOCKET_CLOSE = {
  // The token stopped being valid (revoked or replaced): back to the pairing screen.
  unauthorized: 4401,
  // The hello named another robot's serial.
  serialMismatch: 4403,
  helloTimeout: 4408,
  // A newer connection of the same robot took over: do not reconnect in a loop.
  replaced: 4409,
  // The cloud speaks another CONTRACT_VERSION: the app must be updated.
  contractMismatch: 4426,
  rateLimited: 4429,
} as const;

export type RobotSocketCloseCode = (typeof ROBOT_SOCKET_CLOSE)[keyof typeof ROBOT_SOCKET_CLOSE];
