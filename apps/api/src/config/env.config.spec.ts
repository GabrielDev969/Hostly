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

describe('EMAIL_PROVIDER in production', () => {
  const message =
    'EMAIL_PROVIDER must be resend when NODE_ENV=production (log mode never sends the email)';
  // Production with everything else it requires, so the email rule is the only one left to fail.
  const production = (overrides: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
    const input: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://panel.example',
      METRICS_ALLOWED_IPS: '127.0.0.1',
      ...overrides,
    };
    for (const [key, value] of Object.entries(overrides))
      if (value === undefined) delete input[key];
    return input;
  };

  it.each(['log', undefined])('fails the environment with EMAIL_PROVIDER=%p', (provider) => {
    const parsed = envSchema.safeParse(production({ EMAIL_PROVIDER: provider }));
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toEqual([expect.objectContaining({ message })]);
  });

  it('accepts resend with its key', () => {
    const parsed = envSchema.safeParse(
      production({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test' }),
    );
    expect(parsed.success).toBe(true);
  });

  it.each(['development', 'test'])('keeps log mode in %s', (nodeEnv) => {
    const parsed = envSchema.safeParse({
      ...process.env,
      NODE_ENV: nodeEnv,
      EMAIL_PROVIDER: 'log',
    });
    expect(parsed.success).toBe(true);
  });

  it('stops the boot when production runs in log mode', () => {
    const saved = { ...process.env };
    Object.assign(process.env, production({ EMAIL_PROVIDER: 'log' }));
    const exit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${String(code)}`);
    });
    const error = jest.spyOn(console, 'error').mockImplementation();
    try {
      expect(() => jest.isolateModules(() => require('./env.config'))).toThrow('exit 1');
      expect(exit).toHaveBeenCalledWith(1);
      expect(JSON.stringify(error.mock.calls)).toContain(message);
    } finally {
      process.env = saved;
      exit.mockRestore();
      error.mockRestore();
    }
  });
});
