import { envSchema } from './env.config';
import { prettyLogs } from './logger.config';

// Parses a copy of the test environment, so process.env itself is never touched.
const parse = (logPretty: string | undefined) => {
  const input: NodeJS.ProcessEnv = { ...process.env, LOG_PRETTY: logPretty };
  if (logPretty === undefined) delete input.LOG_PRETTY;
  return envSchema.safeParse(input);
};

describe('LOG_PRETTY', () => {
  it.each([
    ['false', false],
    ['true', true],
  ])('%s turns pretty logs %s', (value, pretty) => {
    const parsed = parse(value);
    expect(parsed.success && parsed.data.LOG_PRETTY).toBe(pretty);
    expect(prettyLogs({ LOG_PRETTY: pretty, NODE_ENV: 'production' })).toBe(pretty);
    expect(prettyLogs({ LOG_PRETTY: pretty, NODE_ENV: 'development' })).toBe(pretty);
  });

  it.each([undefined, ''])('unset (%p) keeps the default: pretty outside production', (value) => {
    const parsed = parse(value);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.LOG_PRETTY).toBeUndefined();
    expect(prettyLogs({ LOG_PRETTY: undefined, NODE_ENV: 'development' })).toBe(true);
    expect(prettyLogs({ LOG_PRETTY: undefined, NODE_ENV: 'test' })).toBe(true);
    expect(prettyLogs({ LOG_PRETTY: undefined, NODE_ENV: 'production' })).toBe(false);
  });

  it.each(['1', '0', 'FALSE', 'yes', ' true'])('fails the environment on %p', (value) => {
    const parsed = parse(value);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toEqual([
      expect.objectContaining({
        path: ['LOG_PRETTY'],
        message: 'LOG_PRETTY must be "true" or "false"',
      }),
    ]);
  });
});
