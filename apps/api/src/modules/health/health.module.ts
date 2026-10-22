import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './http/health.controller';
import { PrismaHealthIndicator } from './indicators/prisma.indicator';
import { RedisHealthIndicator } from './indicators/redis.indicator';
import { QueueHealthIndicator } from './indicators/queue.indicator';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [PrismaHealthIndicator, RedisHealthIndicator, QueueHealthIndicator],
})
export class HealthModule {}
