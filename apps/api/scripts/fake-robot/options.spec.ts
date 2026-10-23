import { ROBOT_SOCKET_DEFAULTS } from '@hostly/contracts';
import { MESSAGES_PER_PING_INTERVAL } from '../../src/modules/robot-link/services/robot-connection';
import { InvalidOptionError, MIN_TELEMETRY_INTERVAL_S, parseTimings } from './options';

const DEFAULT_MS = 10_000;
const TOO_FAST =
  '--telemetry-interval must be at least 2 seconds: the API closes sockets that send more than 20 messages per ping interval (4429)';

describe('fake-robot parseTimings', () => {
  it.each([
    ['2', 2_000],
    ['10', 10_000],
    ['2.5', 2_500],
  ])('accepts a telemetry interval of %s s', (value, ms) => {
    expect(parseTimings({ 'telemetry-interval': value }, DEFAULT_MS).telemetryIntervalMs).toBe(ms);
  });

  it('falls back to the default interval without the flag', () => {
    expect(parseTimings({}, DEFAULT_MS)).toEqual({
      telemetryIntervalMs: DEFAULT_MS,
      closeAfterMs: undefined,
      vanishAfterMs: undefined,
    });
  });

  it.each(['1', '1.9', '0'])('refuses a telemetry interval of %s s, under the minimum', (value) => {
    expect(() => parseTimings({ 'telemetry-interval': value }, DEFAULT_MS)).toThrow(
      new InvalidOptionError(TOO_FAST),
    );
  });

  it.each(['-1', 'abc', '', ' ', '1e3', 'Infinity'])(
    'refuses a telemetry interval of "%s"',
    (value) => {
      expect(() => parseTimings({ 'telemetry-interval': value }, DEFAULT_MS)).toThrow(
        new InvalidOptionError(`--telemetry-interval must be a number of seconds, got "${value}"`),
      );
    },
  );

  it.each(['close-after', 'vanish-after'] as const)('takes --%s in seconds', (flag) => {
    expect(parseTimings({ [flag]: '5' }, DEFAULT_MS)).toMatchObject({
      [flag === 'close-after' ? 'closeAfterMs' : 'vanishAfterMs']: 5_000,
    });
  });

  it.each([
    ['close-after', 'abc', 'must be a number of seconds, got "abc"'],
    ['close-after', '0', 'must be more than 0 seconds, got "0"'],
    ['vanish-after', '-3', 'must be a number of seconds, got "-3"'],
    ['vanish-after', '', 'must be a number of seconds, got ""'],
  ] as const)('refuses --%s %s', (flag, value, message) => {
    expect(() => parseTimings({ [flag]: value }, DEFAULT_MS)).toThrow(
      new InvalidOptionError(`--${flag} ${message}`),
    );
  });

  it('keeps the minimum under the API message limit, the pong included', () => {
    const perWindow = ROBOT_SOCKET_DEFAULTS.pingIntervalMs / (MIN_TELEMETRY_INTERVAL_S * 1000) + 1;
    expect(perWindow).toBeLessThan(MESSAGES_PER_PING_INTERVAL);
    const oneLess =
      ROBOT_SOCKET_DEFAULTS.pingIntervalMs / ((MIN_TELEMETRY_INTERVAL_S - 1) * 1000) + 1;
    expect(oneLess).toBeGreaterThan(MESSAGES_PER_PING_INTERVAL);
  });
});
