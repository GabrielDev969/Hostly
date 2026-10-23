import { createHash, randomBytes } from 'crypto';
import { parseArgs } from 'util';
import { pairRobot, type DeviceTransport } from './pairing';

// Simulates a robot pairing with a running API. The token stays in memory: nothing is written to disk.
const { values } = parseArgs({
  options: {
    serial: { type: 'string' },
    api: { type: 'string' },
  },
});
const serial = values.serial ?? `FAKE-${randomBytes(4).toString('hex').toUpperCase()}`;
const api = (values.api ?? `http://localhost:${process.env.API_PORT ?? '3001'}`).replace(/\/$/, '');

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
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
