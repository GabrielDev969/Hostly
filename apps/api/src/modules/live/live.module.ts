import { Module } from '@nestjs/common';
import IORedis from 'ioredis';
import { env } from 'src/config/env.config';
import { WorkspacesModule } from '@modules/workspaces/workspaces.module';
import { LiveTicketsController } from './http/live-tickets.controller';
import { LiveGateway } from './http/live.gateway';
import { InMemoryLiveEventBus, LiveEventBus } from './services/live-event-bus';
import {
  LIVE_REDIS,
  LiveRedis,
  LiveTicketStore,
  RedisLiveTicketStore,
} from './services/live-ticket-store';
import { IssueLiveTicketUseCase } from './use-cases/issue-live-ticket.use-case';
import { RedeemLiveTicketUseCase } from './use-cases/redeem-live-ticket.use-case';

@Module({
  imports: [WorkspacesModule],
  controllers: [LiveTicketsController],
  providers: [
    { provide: LiveEventBus, useClass: InMemoryLiveEventBus },
    {
      provide: LIVE_REDIS,
      // Commands fail fast instead of queueing while Redis is down, so tickets fail closed.
      useFactory: (): LiveRedis =>
        new IORedis({
          host: env.REDIS_HOST,
          port: env.REDIS_PORT,
          password: env.REDIS_PASSWORD,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        }),
    },
    { provide: LiveTicketStore, useClass: RedisLiveTicketStore },
    IssueLiveTicketUseCase,
    RedeemLiveTicketUseCase,
    LiveGateway,
  ],
  exports: [LiveEventBus],
})
export class LiveModule {}
