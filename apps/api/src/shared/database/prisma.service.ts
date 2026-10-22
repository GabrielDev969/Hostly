import { Pool } from 'pg';
import { env } from 'src/config/env.config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { MetricsService, DbOperation } from '@shared/metrics/metrics.service';

@Injectable()
export class PrismaService
  extends PrismaClient<{
    adapter: PrismaPg;
    log: [
      { level: 'query'; emit: 'event' },
      { level: 'warn'; emit: 'event' },
      { level: 'error'; emit: 'event' },
    ];
  }>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;

  constructor(private readonly metrics: MetricsService) {
    const pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: env.DB_POOL_MAX,
      idleTimeoutMillis: env.DB_POOL_IDLE_MS,
      connectionTimeoutMillis: env.DB_POOL_CONN_TIMEOUT_MS,
    });
    super({
      adapter: new PrismaPg(pool),
      log: [
        { level: 'query', emit: 'event' },
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
      ],
    });
    this.pool = pool;
  }

  async onModuleInit(): Promise<void> {
    this.$on('query', (event: Prisma.QueryEvent) => {
      const op = (event.query.trim().split(' ')[0] || 'OTHER').toUpperCase();
      const operation: DbOperation = (['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const).includes(
        op as 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE',
      )
        ? (op as DbOperation)
        : 'OTHER';
      this.metrics.observeQuery(operation, event.duration / 1000);

      if (event.duration >= env.LOG_SLOW_QUERY_MS) {
        const payload: Record<string, unknown> = {
          msg: 'Slow query',
          durationMs: event.duration,
          thresholdMs: env.LOG_SLOW_QUERY_MS,
          query: event.query,
        };
        if (env.NODE_ENV !== 'production') {
          payload.params = event.params;
        }
        this.logger.warn(payload);
      }
    });
    this.$on('warn', (event: Prisma.LogEvent) => this.logger.warn(event));
    this.$on('error', (event: Prisma.LogEvent) => this.logger.error(event));

    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
  }
}
