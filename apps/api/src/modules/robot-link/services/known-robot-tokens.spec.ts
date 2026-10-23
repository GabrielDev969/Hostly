import {
  KNOWN_TOKEN_ATTEMPT_INTERVAL_MS,
  KnownRobotTokens,
  MAX_KNOWN_TOKENS,
} from './known-robot-tokens';

describe('KnownRobotTokens', () => {
  beforeEach(() => jest.useFakeTimers({ now: 0 }));
  afterEach(() => jest.useRealTimers());

  it('admits only hashes that authenticated, at most once every 2 s each', () => {
    const tokens = new KnownRobotTokens();
    expect(tokens.admit('hash-a')).toBeUndefined();

    tokens.remember('robot-a', 'hash-a');
    expect([tokens.admit('hash-a'), tokens.admit('hash-a')]).toEqual([true, false]);
    jest.advanceTimersByTime(KNOWN_TOKEN_ATTEMPT_INTERVAL_MS - 1);
    expect(tokens.admit('hash-a')).toBe(false);
    jest.advanceTimersByTime(1);
    expect(tokens.admit('hash-a')).toBe(true);

    // Authenticating again does not hand out a new turn.
    tokens.remember('robot-a', 'hash-a');
    expect(tokens.admit('hash-a')).toBe(false);
  });

  it('forgets the hashes a token change leaves invalid', () => {
    const tokens = new KnownRobotTokens();
    tokens.remember('robot-a', 'old-a');
    tokens.remember('robot-a', 'new-a');
    tokens.remember('robot-b', 'hash-b');

    tokens.apply({ robotId: 'robot-a', activeTokenHash: 'new-a' });
    expect(tokens.admit('old-a')).toBeUndefined();
    expect(tokens.admit('new-a')).toBe(true);

    tokens.apply({ robotId: 'robot-a', activeTokenHash: null });
    expect(tokens.admit('new-a')).toBeUndefined();
    expect(tokens.admit('hash-b')).toBe(true);

    tokens.forget('hash-b');
    expect(tokens.size).toBe(0);
  });

  it('keeps at most MAX_KNOWN_TOKENS, dropping the least recently authenticated', () => {
    const tokens = new KnownRobotTokens();
    tokens.remember('robot-first', 'first');
    tokens.remember('robot-second', 'second');
    tokens.remember('robot-first', 'first');
    for (let i = 0; i < MAX_KNOWN_TOKENS - 1; i += 1) tokens.remember(`robot-${i}`, `hash-${i}`);

    expect(tokens.size).toBe(MAX_KNOWN_TOKENS);
    expect(tokens.admit('second')).toBeUndefined();
    expect(tokens.admit('first')).toBe(true);
  });
});
