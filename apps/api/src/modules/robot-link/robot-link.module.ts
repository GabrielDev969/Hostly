import { Module } from '@nestjs/common';
import { RobotsModule } from '@modules/robots/robots.module';
import { LiveModule } from '@modules/live/live.module';
import { RobotLinkGateway } from './http/robot-link.gateway';
import { RobotPresenceRepository } from './repositories/robot-presence.repository.interface';
import { PrismaRobotPresenceRepository } from './repositories/prisma-robot-presence.repository';
import {
  InMemoryRobotConnectionRegistry,
  RobotConnectionRegistry,
} from './services/robot-connection-registry';
import { RobotPresenceSweeper } from './services/robot-presence.sweeper';
import { RobotScopeService } from './services/robot-scope.service';
import { RecordRobotHelloUseCase } from './use-cases/record-robot-hello.use-case';
import { RecordTelemetryUseCase } from './use-cases/record-telemetry.use-case';
import { TouchRobotUseCase } from './use-cases/touch-robot.use-case';
import { MarkRobotOfflineUseCase } from './use-cases/mark-robot-offline.use-case';
import { SweepStaleRobotsUseCase } from './use-cases/sweep-stale-robots.use-case';
import { CleanupOldTelemetryUseCase } from './use-cases/cleanup-old-telemetry.use-case';

@Module({
  imports: [RobotsModule, LiveModule],
  providers: [
    { provide: RobotPresenceRepository, useClass: PrismaRobotPresenceRepository },
    { provide: RobotConnectionRegistry, useClass: InMemoryRobotConnectionRegistry },
    RobotScopeService,
    RecordRobotHelloUseCase,
    RecordTelemetryUseCase,
    TouchRobotUseCase,
    MarkRobotOfflineUseCase,
    SweepStaleRobotsUseCase,
    CleanupOldTelemetryUseCase,
    RobotPresenceSweeper,
    RobotLinkGateway,
  ],
  exports: [CleanupOldTelemetryUseCase],
})
export class RobotLinkModule {}
