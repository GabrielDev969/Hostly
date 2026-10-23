import { createHash, randomBytes } from 'crypto';
import { parseArgs } from 'util';
import { ROBOT_SOCKET_CLOSE, ROBOT_SOCKET_DEFAULTS } from '@hostly/contracts';
import { InvalidOptionError, parseTimings } from './options';
import { pairRobot, type DeviceTransport } from './pairing';
import { connectRobot, SocketRefusedError } from './socket';

// Simulates a robot: pairs with a running API, connects to its socket, says hello and sends telemetry.
// The token stays in memory: nothing is written to disk.
function readOptions() {
  const { values } = parseArgs({
    options: {
      serial: { type: 'string' },
      api: { type: 'string' },
      'telemetry-interval': { type: 'string' },
      'close-after': { type: 'string' },
      'vanish-after': { type: 'string' },
    },
  });
  return { values, timings: parseTimings(values, ROBOT_SOCKET_DEFAULTS.telemetryIntervalMs) };
}

// A bad flag (ours, or one parseArgs refuses, like "--telemetry-interval -1") stops here, before pairing.
const isOptionError = (error: unknown) =>
  error instanceof InvalidOptionError ||
  (error instanceof Error && 'code' in error && String(error.code).startsWith('ERR_PARSE_ARGS'));

let options: ReturnType<typeof readOptions>;
try {
  options = readOptions();
} catch (error) {
  if (!isOptionError(error)) throw error;
  console.error((error as Error).message);
  process.exit(1);
}
const { values, timings } = options;
const serial = values.serial ?? `FAKE-${randomBytes(4).toString('hex').toUpperCase()}`;
const api = (values.api ?? `http://localhost:${process.env.API_PORT ?? '3001'}`).replace(/\/$/, '');
const { telemetryIntervalMs, closeAfterMs, vanishAfterMs } = timings;

const transport: DeviceTransport = async (path, body) => {
  const response = await fetch(`${api}/api/v1${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

async function main(): Promise<void> {
  console.log(`Fake robot ${serial} pairing with ${api}`);
  const robot = await pairRobot({
    transport,
    serial,
    pollIntervalMs: 3_000,
    onCode: ({ code, expiresAt }) => {
      console.log(`Pairing code: ${code} (valid until ${expiresAt})`);
      console.log('Approve it in the panel or in Swagger: POST /api/v1/robots/pairings/approve');
    },
    onPoll: (poll) => {
      if (poll.status === 'pending') console.log('Waiting for approval...');
    },
  });
  const fingerprint = createHash('sha256').update(robot.deviceToken).digest('hex').slice(0, 12);
  console.log(`Paired as robot ${robot.robotId}; token sha256:${fingerprint}… kept in memory only`);

  const link = await connectRobot({ api, deviceToken: robot.deviceToken, serial });
  console.log(`Connected; hello sent, telemetry every ${telemetryIntervalMs / 1000} s`);
  link.sendTelemetry();
  const telemetry = setInterval(() => link.sendTelemetry(), telemetryIntervalMs);

  if (closeAfterMs !== undefined) {
    setTimeout(() => {
      console.log('Closing the socket cleanly');
      link.close();
    }, closeAfterMs);
  }
  if (vanishAfterMs !== undefined) {
    setTimeout(() => {
      console.log('Vanishing: no more pongs or telemetry, socket left open');
      clearInterval(telemetry);
      link.vanish();
    }, vanishAfterMs);
  }
  process.once('SIGINT', () => link.close());

  const { code, reason } = await link.closed;
  clearInterval(telemetry);
  if (code === ROBOT_SOCKET_CLOSE.unauthorized) {
    console.log('Token refused by the cloud (revoked or replaced): pair again');
  } else {
    console.log(`Socket closed: ${code} ${reason}`);
  }
}

main().catch((error: unknown) => {
  if (error instanceof SocketRefusedError && error.status === 401) {
    console.error('Token refused by the cloud (revoked or replaced): pair again');
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
