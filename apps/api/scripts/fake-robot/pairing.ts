import {
  pairPollResponseSchema,
  pairStartResponseSchema,
  type PairPollResponse,
  type PairStartResponse,
} from '@hostly/contracts';

export type DevicePath = '/device/pair/start' | '/device/pair';

export interface DeviceResponse {
  status: number;
  body: unknown;
}

// How the simulated robot reaches the API: fetch in the CLI, supertest in the e2e.
export type DeviceTransport = (path: DevicePath, body: unknown) => Promise<DeviceResponse>;

export interface PairRobotOptions {
  transport: DeviceTransport;
  serial: string;
  pollIntervalMs: number;
  // The robot shows the code on its touch screen.
  onCode: (start: PairStartResponse) => void | Promise<void>;
  onPoll?: (response: PairPollResponse) => void | Promise<void>;
  sleep?: (ms: number) => Promise<void>;
}

export interface PairedRobot {
  robotId: string;
  deviceToken: string;
}

export class PairingExpiredError extends Error {}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function bodyOf(response: DeviceResponse, path: DevicePath, expected: number): unknown {
  if (response.status !== expected) {
    throw new Error(`${path} answered ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return response.body;
}

// The pairing flow of the robot app: start, show the code, poll until approved or expired.
// Every response is parsed with the @hostly/contracts schemas, so a drift from the contract fails here.
export async function pairRobot(options: PairRobotOptions): Promise<PairedRobot> {
  const sleep = options.sleep ?? wait;
  const startPath = '/device/pair/start';
  const start = pairStartResponseSchema.parse(
    bodyOf(await options.transport(startPath, { serial: options.serial }), startPath, 201),
  );
  await options.onCode(start);

  for (;;) {
    const response = await options.transport('/device/pair', { pairingId: start.pairingId });
    if (response.status !== 429) {
      const poll = pairPollResponseSchema.parse(bodyOf(response, '/device/pair', 200));
      await options.onPoll?.(poll);
      if (poll.status === 'approved') {
        return { robotId: poll.robotId, deviceToken: poll.deviceToken };
      }
      if (poll.status === 'expired') {
        throw new PairingExpiredError(`Pairing code ${start.code} expired before approval`);
      }
    }
    await sleep(options.pollIntervalMs);
  }
}
