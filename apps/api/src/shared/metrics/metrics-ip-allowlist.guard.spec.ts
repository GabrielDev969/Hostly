import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { MetricsIpAllowlistGuard } from './metrics-ip-allowlist.guard';
import { env } from 'src/config/env.config';

describe('MetricsIpAllowlistGuard', () => {
  const makeCtx = (ip: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ ip }),
      }),
    }) as unknown as ExecutionContext;

  let guard: MetricsIpAllowlistGuard;
  const original = env.METRICS_ALLOWED_IPS;

  beforeEach(() => {
    guard = new MetricsIpAllowlistGuard();
  });

  afterEach(() => {
    (env as { METRICS_ALLOWED_IPS?: string[] }).METRICS_ALLOWED_IPS = original;
  });

  it('denies (default deny) when allowlist is unset', () => {
    (env as { METRICS_ALLOWED_IPS?: string[] }).METRICS_ALLOWED_IPS = undefined;
    expect(() => guard.canActivate(makeCtx('1.2.3.4'))).toThrow(ForbiddenException);
  });

  it('denies (default deny) when allowlist is empty', () => {
    (env as { METRICS_ALLOWED_IPS?: string[] }).METRICS_ALLOWED_IPS = [];
    expect(() => guard.canActivate(makeCtx('1.2.3.4'))).toThrow(ForbiddenException);
  });

  it('allows IPs that are in the allowlist', () => {
    (env as { METRICS_ALLOWED_IPS?: string[] }).METRICS_ALLOWED_IPS = ['127.0.0.1', '10.0.0.5'];
    expect(guard.canActivate(makeCtx('10.0.0.5'))).toBe(true);
  });

  it('rejects IPs that are not in the allowlist', () => {
    (env as { METRICS_ALLOWED_IPS?: string[] }).METRICS_ALLOWED_IPS = ['127.0.0.1'];
    expect(() => guard.canActivate(makeCtx('1.2.3.4'))).toThrow(ForbiddenException);
  });

  it('rejects when req.ip is missing and allowlist is set', () => {
    (env as { METRICS_ALLOWED_IPS?: string[] }).METRICS_ALLOWED_IPS = ['127.0.0.1'];
    expect(() => guard.canActivate(makeCtx(''))).toThrow(ForbiddenException);
  });
});
