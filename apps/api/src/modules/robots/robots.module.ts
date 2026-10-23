import { Module } from '@nestjs/common';
import IORedis from 'ioredis';
import { env } from 'src/config/env.config';
import { WorkspacesModule } from '@modules/workspaces/workspaces.module';
import { SitesModule } from '@modules/sites/sites.module';
import { RobotsRepository } from './repositories/robots.repository.interface';
import { PrismaRobotsRepository } from './repositories/prisma-robots.repository';
import { RobotPairingsRepository } from './repositories/robot-pairings.repository.interface';
import { PrismaRobotPairingsRepository } from './repositories/prisma-robot-pairings.repository';
import {
  PAIRING_REDIS,
  PairingRateLimiter,
  PairingRedis,
} from './services/pairing-rate-limiter.service';
import { PairingCodesService } from './services/pairing-codes.service';
import { RobotAuthService } from './services/robot-auth.service';
import { DevicePairingController } from './http/device-pairing.controller';
import { RobotPairingsController } from './http/robot-pairings.controller';
import { RobotsController } from './http/robots.controller';
import { StartPairingUseCase } from './use-cases/start-pairing.use-case';
import { PollPairingUseCase } from './use-cases/poll-pairing.use-case';
import { LookupPairingUseCase } from './use-cases/lookup-pairing.use-case';
import { ApprovePairingUseCase } from './use-cases/approve-pairing.use-case';
import { ListRobotsUseCase } from './use-cases/list-robots.use-case';
import { GetRobotUseCase } from './use-cases/get-robot.use-case';
import { RenameRobotUseCase } from './use-cases/rename-robot.use-case';
import { MoveRobotUseCase } from './use-cases/move-robot.use-case';
import { RevokeRobotUseCase } from './use-cases/revoke-robot.use-case';

@Module({
  imports: [WorkspacesModule, SitesModule],
  controllers: [DevicePairingController, RobotPairingsController, RobotsController],
  providers: [
    { provide: RobotsRepository, useClass: PrismaRobotsRepository },
    { provide: RobotPairingsRepository, useClass: PrismaRobotPairingsRepository },
    {
      provide: PAIRING_REDIS,
      // Real Redis in tests too, unlike the cache and idempotency stores: the limits must hold.
      // Commands fail fast instead of queueing while Redis is down, so pairing fails closed.
      useFactory: (): PairingRedis =>
        new IORedis({
          host: env.REDIS_HOST,
          port: env.REDIS_PORT,
          password: env.REDIS_PASSWORD,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        }),
    },
    PairingRateLimiter,
    PairingCodesService,
    RobotAuthService,
    StartPairingUseCase,
    PollPairingUseCase,
    LookupPairingUseCase,
    ApprovePairingUseCase,
    ListRobotsUseCase,
    GetRobotUseCase,
    RenameRobotUseCase,
    MoveRobotUseCase,
    RevokeRobotUseCase,
  ],
  exports: [RobotAuthService],
})
export class RobotsModule {}
