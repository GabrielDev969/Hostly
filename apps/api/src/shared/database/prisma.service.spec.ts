import { Logger } from '@nestjs/common';

type Listener = (event: unknown) => void;
const listeners: Record<string, Listener> = {};

const $on = jest.fn((event: string, cb: Listener) => {
  listeners[event] = cb;
});
const $connect = jest.fn().mockResolvedValue(undefined);
const $disconnect = jest.fn().mockResolvedValue(undefined);

class MockPrismaClient {
  $on = $on;
  $connect = $connect;
  $disconnect = $disconnect;
  constructor(_args?: unknown) {
    void _args;
  }
}

jest.mock('@prisma/client', () => ({
  __esModule: true,
  PrismaClient: MockPrismaClient,
  Prisma: {},
}));

const poolEnd = jest.fn().mockResolvedValue(undefined);
const poolCtor = jest.fn();
jest.mock('pg', () => ({
  __esModule: true,
  Pool: jest.fn().mockImplementation((args: unknown) => {
    poolCtor(args);
    return { end: poolEnd };
  }),
}));

jest.mock('@prisma/adapter-pg', () => ({
  __esModule: true,
  PrismaPg: jest.fn().mockImplementation(() => ({})),
}));

import { PrismaService } from './prisma.service';
import { MetricsService } from '@shared/metrics/metrics.service';
import { env } from 'src/config/env.config';

describe('PrismaService', () => {
  let metrics: jest.Mocked<Pick<MetricsService, 'observeQuery'>>;
  let service: PrismaService;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(async () => {
    for (const k of Object.keys(listeners)) delete listeners[k];
    $on.mockClear();
    $connect.mockClear();
    $disconnect.mockClear();
    poolEnd.mockClear();
    poolCtor.mockClear();

    metrics = { observeQuery: jest.fn() };
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    service = new PrismaService(metrics as unknown as MetricsService);
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('registers query/warn/error event listeners and connects on init', () => {
    expect($on).toHaveBeenCalledWith('query', expect.any(Function));
    expect($on).toHaveBeenCalledWith('warn', expect.any(Function));
    expect($on).toHaveBeenCalledWith('error', expect.any(Function));
    expect($connect).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('Prisma connected');
  });

  it.each([
    ['SELECT * FROM users', 'SELECT'],
    ['INSERT INTO users VALUES (1)', 'INSERT'],
    ['UPDATE users SET x = 1', 'UPDATE'],
    ['DELETE FROM users', 'DELETE'],
    ['TRUNCATE users', 'OTHER'],
  ])('observes query metric for "%s" as operation %s', (query, op) => {
    listeners['query']!({ query, duration: 5, params: '[]' });

    expect(metrics.observeQuery).toHaveBeenCalledWith(op, 5 / 1000);
  });

  it('treats an empty query string as OTHER', () => {
    listeners['query']!({ query: '', duration: 1, params: '[]' });
    expect(metrics.observeQuery).toHaveBeenCalledWith('OTHER', 0.001);
  });

  it('logs a warn when the query duration meets or exceeds the slow threshold, including params outside production', () => {
    listeners['query']!({
      query: 'SELECT * FROM "User" WHERE email = $1',
      duration: env.LOG_SLOW_QUERY_MS,
      params: '["jane@example.com"]',
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'Slow query',
        durationMs: env.LOG_SLOW_QUERY_MS,
        thresholdMs: env.LOG_SLOW_QUERY_MS,
        query: 'SELECT * FROM "User" WHERE email = $1',
        params: '["jane@example.com"]',
      }),
    );
  });

  it('omits params from the slow-query log when NODE_ENV is production', () => {
    const original = env.NODE_ENV;
    (env as { NODE_ENV: string }).NODE_ENV = 'production';
    try {
      listeners['query']!({
        query: 'SELECT * FROM "User" WHERE email = $1',
        duration: env.LOG_SLOW_QUERY_MS,
        params: '["jane@example.com"]',
      });

      const callArg = warnSpy.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg).not.toHaveProperty('params');
      expect(callArg.msg).toBe('Slow query');
      expect(callArg.query).toBe('SELECT * FROM "User" WHERE email = $1');
    } finally {
      (env as { NODE_ENV: string }).NODE_ENV = original;
    }
  });

  it('does not log a slow-query warn when the query is below the threshold', () => {
    listeners['query']!({
      query: 'SELECT 1',
      duration: 1,
      params: '[]',
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('routes Prisma warn events to the logger', () => {
    listeners['warn']!({ message: 'something odd' });

    expect(warnSpy).toHaveBeenCalledWith({ message: 'something odd' });
  });

  it('routes Prisma error events to the logger', () => {
    listeners['error']!({ message: 'kaboom' });

    expect(errorSpy).toHaveBeenCalledWith({ message: 'kaboom' });
  });

  it('disconnects the client and closes the pool on module destroy', async () => {
    await service.onModuleDestroy();

    expect($disconnect).toHaveBeenCalledTimes(1);
    expect(poolEnd).toHaveBeenCalledTimes(1);
  });

  it('builds its own pool per instance (no top-level singleton)', async () => {
    const initialPoolCalls = poolCtor.mock.calls.length;
    poolEnd.mockClear();

    const second = new PrismaService(metrics as unknown as MetricsService);
    await second.onModuleInit();

    expect(poolCtor).toHaveBeenCalledTimes(initialPoolCalls + 1);

    await service.onModuleDestroy();
    await second.onModuleDestroy();

    // Each instance closes its own pool on destroy.
    expect(poolEnd).toHaveBeenCalledTimes(2);
  });
});
