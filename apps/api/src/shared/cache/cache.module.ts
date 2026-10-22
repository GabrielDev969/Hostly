import { Global, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { Keyv } from 'keyv';
import IORedis from 'ioredis';
import { env } from 'src/config/env.config';
import { CACHE_NSVER_REDIS, CacheService, NamespaceVersionStore } from './cache.service';

const redisUrl = (): string => {
  const auth = env.REDIS_PASSWORD ? `:${env.REDIS_PASSWORD}@` : '';
  return `redis://${auth}${env.REDIS_HOST}:${env.REDIS_PORT}`;
};

@Global()
@Module({
  imports: [
    CacheModule.register({
      isGlobal: true,
      stores:
        env.NODE_ENV === 'test' ? undefined : [new Keyv({ store: new KeyvRedis(redisUrl()) })],
    }),
  ],
  providers: [
    CacheService,
    {
      provide: CACHE_NSVER_REDIS,
      useFactory: (): NamespaceVersionStore | null => {
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
  exports: [CacheService],
})
export class AppCacheModule {}
