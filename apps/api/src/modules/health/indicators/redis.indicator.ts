import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { HealthIndicatorService, HealthIndicatorResult } from '@nestjs/terminus';
import Redis from 'ioredis';
import { env } from 'src/config/env.config';

@Injectable()
export class RedisHealthIndicator implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(private readonly healthIndicator: HealthIndicatorService) {
    this.client = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
    });
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicator.check(key);
    try {
      const reply: string = await this.client.ping();
      if (reply !== 'PONG') {
        return indicator.down({ message: `Unexpected reply: ${reply}` });
      }
      return indicator.up();
    } catch (err) {
      return indicator.down({
        message: err instanceof Error ? err.message : 'Redis unreachable',
      });
    }
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}
