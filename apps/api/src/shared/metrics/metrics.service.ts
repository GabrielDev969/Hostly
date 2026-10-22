import { Injectable, OnModuleInit } from '@nestjs/common';
import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

export type LoginResult = 'success' | 'failure' | 'requires_2fa';
export type RegisterResult = 'success' | 'conflict';
export type TwoFactorEnableResult = 'success' | 'invalid_code' | 'invalid_password' | 'not_found';
export type TwoFactorVerifyResult = 'success' | 'invalid_challenge' | 'invalid_code';
export type DbOperation = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'OTHER';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request latency in seconds',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  readonly httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests served',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });

  readonly authLoginAttempts = new Counter({
    name: 'auth_login_attempts_total',
    help: 'Login attempts by outcome',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  readonly authRegister = new Counter({
    name: 'auth_register_total',
    help: 'Registration attempts by outcome',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  readonly auth2faEnable = new Counter({
    name: 'auth_2fa_enable_total',
    help: '2FA enable attempts by outcome',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  readonly auth2faVerify = new Counter({
    name: 'auth_2fa_verify_total',
    help: '2FA verify attempts by outcome',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  readonly databaseQueryDuration = new Histogram({
    name: 'database_query_duration_seconds',
    help: 'Prisma query latency in seconds, labeled by SQL operation',
    labelNames: ['operation'] as const,
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [this.registry],
  });

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  observeHttpRequest(
    labels: { method: string; route: string; status_code: string },
    durationSec: number,
  ): void {
    this.httpRequestDuration.observe(labels, durationSec);
    this.httpRequestsTotal.inc(labels);
  }

  incLoginAttempt(result: LoginResult): void {
    this.authLoginAttempts.inc({ result });
  }

  incRegister(result: RegisterResult): void {
    this.authRegister.inc({ result });
  }

  incTwoFactorEnable(result: TwoFactorEnableResult): void {
    this.auth2faEnable.inc({ result });
  }

  incTwoFactorVerify(result: TwoFactorVerifyResult): void {
    this.auth2faVerify.inc({ result });
  }

  observeQuery(operation: DbOperation, durationSec: number): void {
    this.databaseQueryDuration.observe({ operation }, durationSec);
  }

  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
