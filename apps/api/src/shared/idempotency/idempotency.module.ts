import { Global, Module } from '@nestjs/common';
import IORedis from 'ioredis';
import { env } from 'src/config/env.config';
import { IDEMPOTENCY_REDIS } from './constants';
import { IdempotencyRedis, IdempotencyService } from './idempotency.service';

@Global()
@Module({
  providers: [
    IdempotencyService,
    {
      provide: IDEMPOTENCY_REDIS,
      useFactory: (): IdempotencyRedis | null => {
        if (env.NODE_ENV === 'test') return null;
        return new IORedis({
          host: env.REDIS_HOST,
          port: env.REDIS_PORT,
          password: env.REDIS_PASSWORD,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        });
      },
    },
  ],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
