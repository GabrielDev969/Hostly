import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { env } from 'src/config/env.config';
import { SweepStaleRobotsUseCase } from '../use-cases/sweep-stale-robots.use-case';

// Runs at startup and then every ping interval, in process: a robot left "online" by a restart or a crash goes
// offline once its lastSeenAt is older than the missed pings allow. Idempotent, so every instance may run it.
@Injectable()
export class RobotPresenceSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('RobotPresenceSweeper');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly sweep: SweepStaleRobotsUseCase) {}

  onApplicationBootstrap(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), env.ROBOT_SOCKET_PING_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.sweep.execute();
    } catch (error) {
      this.logger.error({ msg: 'Stale robot sweep failed', error: (error as Error).message });
    } finally {
      this.running = false;
    }
  }
}
